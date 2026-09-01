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
function humanOrderFields(suffix = createRandomToken(8), offset = 0) {
  const orderNumber = (Number.parseInt(suffix.slice(0, 6), 36) % 900000) + offset;
  return { orderYear: 2026, orderNumber, humanReadableId: `${orderNumber.toString().padStart(4, "0")}.2026` };
}

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

async function userHeaders(userId: string) {
  const token = createRandomToken(48);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
  return { cookie: `ca_session=${token}` };
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
      ...humanOrderFields(),
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
    expect(created.json().batch.createdBy).toEqual({ id: admin.user.id, name: admin.user.name });

    const eligible = await app.inject({ method: "GET", url: `/admin/production-batches/${batchId}/eligible-orders`, headers: admin.headers });
    expect(eligible.statusCode).toBe(200);
    expect(eligible.json().orders.map((entry: { id: string }) => entry.id)).toEqual(expect.arrayContaining([firstPaid.id, secondPaid.id]));
    expect(eligible.json().orders.map((entry: { id: string }) => entry.id)).not.toContain(unpaid.id);
    expect(eligible.json().orders.find((entry: { id: string }) => entry.id === firstPaid.id).user).toEqual({ id: fixture.buyer.id, name: fixture.buyer.name });

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
    expect(associated.json().batch.createdBy).not.toHaveProperty("email");
    expect(associated.json().batch.orders[0].user).not.toHaveProperty("email");
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

    for (const status of ["SENT_TO_PRODUCTION", "RECEIVED"] as const) {
      const transitioned = await app.inject({
        method: "POST",
        url: `/admin/production-batches/${batchId}/transition`,
        headers: admin.headers,
        payload: { status }
      });
      expect(transitioned.statusCode).toBe(200);
      expect(transitioned.json().batch.status).toBe(status);
    }

    const directReady = await app.inject({
      method: "POST",
      url: `/admin/production-batches/${batchId}/transition`,
      headers: admin.headers,
      payload: { status: "READY_FOR_PICKUP" }
    });
    expect(directReady.statusCode).toBe(409);

    const pickup = await app.inject({
      method: "PUT",
      url: `/admin/production-batches/${batchId}/pickup`,
      headers: admin.headers,
      payload: { location: "Sala do Centro Academico", notes: "Retirada das 18h as 21h.", date: "2026-08-25", time: "18:00" }
    });
    expect(pickup.statusCode).toBe(200);
    expect(pickup.json().batch).toMatchObject({ status: "READY_FOR_PICKUP", pickupLocation: "Sala do Centro Academico", pickupDate: "2026-08-25", pickupTime: "18:00" });

    const buyerHeaders = await userHeaders(fixture.buyer.id);
    const buyerOrder = await app.inject({ method: "GET", url: `/orders/${firstPaid.publicId}`, headers: buyerHeaders });
    expect(buyerOrder.json().order.pickup).toEqual({ available: true, pickedUp: false, location: "Sala do Centro Academico", notes: "Retirada das 18h as 21h.", date: "2026-08-25", time: "18:00" });
    const userCannotPickup = await app.inject({ method: "POST", url: `/admin/orders/${firstPaid.publicId}/pickup`, headers: buyerHeaders, payload: {} });
    expect(userCannotPickup.statusCode).toBe(403);

    const prematureClose = await app.inject({ method: "POST", url: `/admin/production-batches/${batchId}/transition`, headers: admin.headers, payload: { status: "CLOSED" } });
    expect(prematureClose.statusCode).toBe(409);

    for (const currentOrder of [firstPaid, secondPaid]) {
      const pickedUp = await app.inject({ method: "POST", url: `/admin/orders/${currentOrder.publicId}/pickup`, headers: admin.headers, payload: {} });
      expect(pickedUp.statusCode).toBe(200);
      expect(pickedUp.json().order.pickup.pickedUp).toBe(true);
    }
    const historyCount = await prisma.orderStatusHistory.count({ where: { orderId: firstPaid.id, newFulfillmentStatus: "PICKED_UP" } });
    const duplicatePickup = await app.inject({ method: "POST", url: `/admin/orders/${firstPaid.publicId}/pickup`, headers: admin.headers, payload: {} });
    expect(duplicatePickup.statusCode).toBe(200);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: firstPaid.id, newFulfillmentStatus: "PICKED_UP" } })).toBe(historyCount);

    const pickupHistory = await prisma.orderStatusHistory.findFirstOrThrow({ where: { orderId: firstPaid.id, newFulfillmentStatus: "PICKED_UP" } });
    expect(pickupHistory).toMatchObject({ changedByUserId: admin.user.id, previousFulfillmentStatus: "READY_FOR_PICKUP", source: "ADMIN" });
    expect(pickupHistory.createdAt).toBeInstanceOf(Date);

    const closed = await app.inject({ method: "POST", url: `/admin/production-batches/${batchId}/transition`, headers: admin.headers, payload: { status: "CLOSED" } });
    expect(closed.statusCode).toBe(200);

    const finalBatch = await prisma.productionBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(finalBatch.closedAt).not.toBeNull();
    const finalOrders = await prisma.order.findMany({ where: { id: { in: [firstPaid.id, secondPaid.id] } } });
    expect(finalOrders.every((entry) => entry.fulfillmentStatus === "PICKED_UP")).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityType: "ProductionBatch", entityId: batchId } })).toBe(6);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: firstPaid.id, source: "ADMIN" } })).toBe(5);
    await app.close();
  });
});



