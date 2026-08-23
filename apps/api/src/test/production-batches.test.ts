import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const env = readFileSync(join(process.cwd(), "..", "..", ".env"), "utf8");
for (const line of env.split(/\r?\n/)) {
  const [key, ...values] = line.split("=");
  if (key && values.length && process.env[key] === undefined) process.env[key] = values.join("=").replace(/\$\$/g, "$");
}

const { buildApp } = await import("../app.js");
const { prisma } = await import("../plugins/prisma.js");
const { createRandomToken, hashToken } = await import("../lib/crypto.js");

async function adminSession() {
  const token = createRandomToken(48);
  const suffix = createRandomToken(8);
  const user = await prisma.user.create({
    data: {
      googleSubject: `batch-admin-${suffix}`,
      name: "Batch Admin",
      email: `batch-admin-${suffix}@unijui.edu.br`,
      role: "ADMIN"
    }
  });
  await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
  return { user, headers: { cookie: `ca_session=${token}` } };
}

async function catalogFixture() {
  const suffix = createRandomToken(6);
  const product = await prisma.product.create({
    data: {
      name: `Camiseta Lote ${suffix}`,
      slug: `camiseta-lote-${suffix}`,
      description: "Camiseta para teste de lote",
      costPrice: 20,
      salePrice: 40,
      active: true,
      variants: { create: [{ name: "P" }, { name: "M" }] }
    },
    include: { variants: true }
  });
  const buyer = await prisma.user.create({
    data: { googleSubject: `batch-buyer-${suffix}`, name: "Batch Buyer", email: `batch-buyer-${suffix}@sou.unijui.edu.br` }
  });
  return { product, buyer, sizeP: product.variants.find((variant) => variant.name === "P")!, sizeM: product.variants.find((variant) => variant.name === "M")! };
}

async function order(fixture: Awaited<ReturnType<typeof catalogFixture>>, quantities: { p: number; m?: number }, paid = true) {
  const items = [
    {
      productId: fixture.product.id,
      productVariantId: fixture.sizeP.id,
      productNameSnapshot: fixture.product.name,
      variantNameSnapshot: "P",
      unitPrice: 40,
      quantity: quantities.p,
      totalPrice: 40 * quantities.p
    },
    ...(quantities.m ? [{
      productId: fixture.product.id,
      productVariantId: fixture.sizeM.id,
      productNameSnapshot: fixture.product.name,
      variantNameSnapshot: "M",
      unitPrice: 40,
      quantity: quantities.m,
      totalPrice: 40 * quantities.m
    }] : [])
  ];
  const total = items.reduce((sum, item) => sum + item.totalPrice, 0);
  return prisma.order.create({
    data: {
      publicId: createRandomToken(18),
      userId: fixture.buyer.id,
      paymentStatus: paid ? "CONFIRMED" : "PENDING",
      fulfillmentStatus: paid ? "PAID" : "WAITING_PAYMENT",
      subtotal: total,
      total,
      items: { create: items }
    }
  });
}

describe("production batches", () => {
  it("groups only paid orders, calculates summary, and enforces the status flow", async () => {
    const app = buildApp();
    const admin = await adminSession();
    const fixture = await catalogFixture();
    const firstPaid = await order(fixture, { p: 2 });
    const secondPaid = await order(fixture, { p: 3, m: 1 });
    const unpaid = await order(fixture, { p: 10 }, false);

    const created = await app.inject({
      method: "POST",
      url: "/admin/production-batches",
      headers: admin.headers,
      payload: { name: "Lote de camisetas agosto", notes: "Enviar ao fabricante parceiro." }
    });
    expect(created.statusCode).toBe(201);
    const batchId = created.json().batch.id as string;

    const eligible = await app.inject({ method: "GET", url: `/admin/production-batches/${batchId}/eligible-orders`, headers: admin.headers });
    expect(eligible.statusCode).toBe(200);
    expect(eligible.json().orders.map((entry: any) => entry.id)).toEqual(expect.arrayContaining([firstPaid.id, secondPaid.id]));
    expect(eligible.json().orders.map((entry: any) => entry.id)).not.toContain(unpaid.id);

    const denied = await app.inject({
      method: "PUT",
      url: `/admin/production-batches/${batchId}/orders`,
      headers: admin.headers,
      payload: { orderIds: [unpaid.id] }
    });
    expect(denied.statusCode).toBe(400);

    const associated = await app.inject({
      method: "PUT",
      url: `/admin/production-batches/${batchId}/orders`,
      headers: admin.headers,
      payload: { orderIds: [firstPaid.id, secondPaid.id] }
    });
    expect(associated.statusCode).toBe(200);
    expect(associated.json().batch.summary).toEqual([{
      productId: fixture.product.id,
      productName: fixture.product.name,
      totalQuantity: 6,
      variants: [
        { productVariantId: fixture.sizeM.id, variantName: "M", quantity: 1 },
        { productVariantId: fixture.sizeP.id, variantName: "P", quantity: 5 }
      ]
    }]);

    const anotherBatch = await app.inject({ method: "POST", url: "/admin/production-batches", headers: admin.headers, payload: { name: "Outro lote" } });
    const conflict = await app.inject({
      method: "PUT",
      url: `/admin/production-batches/${anotherBatch.json().batch.id}/orders`,
      headers: admin.headers,
      payload: { orderIds: [firstPaid.id] }
    });
    expect(conflict.statusCode).toBe(409);

    const invalidTransition = await app.inject({
      method: "POST",
      url: `/admin/production-batches/${batchId}/transition`,
      headers: admin.headers,
      payload: { status: "RECEIVED" }
    });
    expect(invalidTransition.statusCode).toBe(409);

    for (const status of ["SENT_TO_PRODUCTION", "RECEIVED", "READY_FOR_PICKUP", "CLOSED"] as const) {
      const transitioned = await app.inject({
        method: "POST",
        url: `/admin/production-batches/${batchId}/transition`,
        headers: admin.headers,
        payload: { status }
      });
      expect(transitioned.statusCode).toBe(200);
      expect(transitioned.json().batch.status).toBe(status);
    }

    const finalBatch = await prisma.productionBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(finalBatch.closedAt).not.toBeNull();
    const finalOrders = await prisma.order.findMany({ where: { id: { in: [firstPaid.id, secondPaid.id] } } });
    expect(finalOrders.every((entry) => entry.fulfillmentStatus === "READY_FOR_PICKUP")).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityType: "ProductionBatch", entityId: batchId } })).toBe(6);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: firstPaid.id, source: "ADMIN" } })).toBe(4);
    await app.close();
  });
});
