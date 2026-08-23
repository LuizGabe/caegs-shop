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

async function session(role: "USER" | "ADMIN", userId?: string) {
  const token = createRandomToken(48);
  const suffix = createRandomToken(8);
  const user = userId ? await prisma.user.findUniqueOrThrow({ where: { id: userId } }) : await prisma.user.create({ data: {
    googleSubject: `report-${role}-${suffix}`,
    name: `Report ${role}`,
    email: `report-${role}-${suffix}@unijui.edu.br`,
    role
  } });
  await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
  return { user, headers: { cookie: `ca_session=${token}` } };
}

describe("administrative reports", () => {
  it("exports safe CSV files and excludes refunded sales from dashboard units", async () => {
    const app = buildApp();
    const admin = await session("ADMIN");
    const suffix = createRandomToken(6);
    const sizeName = `+P-${suffix}`;
    const course = await prisma.course.create({ data: { name: "@Curso, Especial", slug: `curso-relatorio-${suffix}` } });
    const buyer = await prisma.user.create({ data: {
      googleSubject: `report-buyer-${suffix}`,
      name: "=HYPERLINK(\"https://example.invalid\")",
      email: `+report-${suffix}@sou.unijui.edu.br`,
      courseId: course.id
    } });
    const buyerSession = await session("USER", buyer.id);
    const product = await prisma.product.create({ data: {
      name: "=Camiseta Açúcar, Premium",
      slug: `camiseta-relatorio-${suffix}`,
      description: "Produto para relatorio",
      costPrice: 20,
      salePrice: 35,
      active: true,
      variants: { create: { name: sizeName } }
    }, include: { variants: true } });
    const confirmedOrder = await prisma.order.create({ data: {
      publicId: createRandomToken(18),
      userId: buyer.id,
      paymentStatus: "CONFIRMED",
      fulfillmentStatus: "IN_PRODUCTION",
      subtotal: 70,
      total: 70,
      items: { create: { productId: product.id, productVariantId: product.variants[0]!.id, productNameSnapshot: product.name, variantNameSnapshot: product.variants[0]!.name, unitPrice: 35, quantity: 2, totalPrice: 70 } },
      payments: { create: { idempotencyKey: createRandomToken(32), provider: "ASAAS", providerPaymentId: `pay-confirmed-${suffix}`, method: "PIX", status: "CONFIRMED", amount: 70, confirmedAt: new Date() } }
    } });
    await prisma.order.create({ data: {
      publicId: createRandomToken(18),
      userId: buyer.id,
      paymentStatus: "PENDING",
      fulfillmentStatus: "WAITING_PAYMENT",
      subtotal: 700,
      total: 700,
      items: { create: { productId: product.id, productVariantId: product.variants[0]!.id, productNameSnapshot: product.name, variantNameSnapshot: sizeName, unitPrice: 35, quantity: 20, totalPrice: 700 } }
    } });
    const secondProduct = await prisma.product.create({ data: {
      name: `Outro produto ${suffix}`,
      slug: `outro-produto-relatorio-${suffix}`,
      description: "Confirma agrupamento por tamanho",
      costPrice: 2,
      salePrice: 5,
      variants: { create: { name: sizeName.toLowerCase() } }
    }, include: { variants: true } });
    await prisma.order.create({ data: {
      publicId: createRandomToken(18),
      userId: buyer.id,
      paymentStatus: "CONFIRMED",
      fulfillmentStatus: "PAID",
      subtotal: 15,
      total: 15,
      items: { create: { productId: secondProduct.id, productVariantId: secondProduct.variants[0]!.id, productNameSnapshot: secondProduct.name, variantNameSnapshot: sizeName.toLowerCase(), unitPrice: 5, quantity: 3, totalPrice: 15 } },
      payments: { create: { idempotencyKey: createRandomToken(32), provider: "ASAAS", providerPaymentId: `pay-confirmed-second-${suffix}`, method: "PIX", status: "CONFIRMED", amount: 15, confirmedAt: new Date() } }
    } });
    const refundedProduct = await prisma.product.create({ data: {
      name: `Produto Reembolsado ${suffix}`,
      slug: `produto-reembolsado-${suffix}`,
      description: "Nao deve contar como venda",
      costPrice: 10,
      salePrice: 999999,
      variants: { create: { name: "G" } }
    }, include: { variants: true } });
    await prisma.order.create({ data: {
      publicId: createRandomToken(18),
      userId: buyer.id,
      paymentStatus: "REFUNDED",
      fulfillmentStatus: "IN_PRODUCTION",
      subtotal: 999999,
      total: 999999,
      items: { create: { productId: refundedProduct.id, productVariantId: refundedProduct.variants[0]!.id, productNameSnapshot: refundedProduct.name, variantNameSnapshot: "G", unitPrice: 999999, quantity: 50, totalPrice: 999999 } },
      payments: { create: { idempotencyKey: createRandomToken(32), provider: "ASAAS", providerPaymentId: `pay-refunded-${suffix}`, method: "PIX", status: "REFUNDED", amount: 999999, confirmedAt: new Date(), refundedAt: new Date() } }
    } });
    const batch = await prisma.productionBatch.create({ data: {
      code: `REPORT-${suffix}`,
      name: "Lote relatorio",
      createdByUserId: admin.user.id,
      orders: { create: { orderId: confirmedOrder.id } }
    } });

    const forbidden = await app.inject({ method: "GET", url: "/admin/dashboard", headers: buyerSession.headers });
    expect(forbidden.statusCode).toBe(403);

    const production = await app.inject({ method: "GET", url: `/admin/reports/production-batches/${batch.id}.csv`, headers: admin.headers });
    expect(production.statusCode).toBe(200);
    expect(production.headers["content-type"]).toContain("text/csv");
    expect(production.body.charCodeAt(0)).toBe(0xfeff);
    expect(production.body).toContain('"Produto","Tamanho","Quantidade"');
    expect(production.body).toContain(`"'=Camiseta Açúcar, Premium","'${sizeName}","2"`);
    expect(production.body).not.toContain(buyer.name);
    expect(production.body).not.toContain(buyer.email);

    const orders = await app.inject({ method: "GET", url: "/admin/reports/orders.csv", headers: admin.headers });
    expect(orders.statusCode).toBe(200);
    expect(orders.body.charCodeAt(0)).toBe(0xfeff);
    expect(orders.body).toContain('"\'=HYPERLINK(""https://example.invalid"")"');
    expect(orders.body).toContain(`"'+report-${suffix}@sou.unijui.edu.br"`);
    expect(orders.body).toContain('"\'@Curso, Especial"');
    expect(orders.body).not.toContain("CPF");

    const dashboard = await app.inject({ method: "GET", url: "/admin/dashboard", headers: admin.headers });
    expect(dashboard.statusCode).toBe(200);
    const data = dashboard.json();
    expect(data.unitsByProduct).toContainEqual({ productId: product.id, name: product.name, quantity: 2 });
    expect(data.unitsByProduct.some((entry: { productId: string }) => entry.productId === refundedProduct.id)).toBe(false);
    expect(data.unitsByVariant).toContainEqual({ name: sizeName, quantity: 5 });
    expect(data.metrics.confirmedValue).toBeLessThan(999999);
    expect(data.metrics.batches).toBeGreaterThanOrEqual(1);
    expect(await prisma.auditLog.count({ where: { actorUserId: admin.user.id, action: { in: ["PRODUCTION_CSV_EXPORTED", "ORDERS_CSV_EXPORTED"] } } })).toBe(2);
    await app.close();
  });
});
