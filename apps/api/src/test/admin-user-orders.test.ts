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

function humanOrderFields() {
  const orderNumber = Number.parseInt(createRandomToken(8).slice(0, 6), 36);
  return { orderYear: 2026, orderNumber, humanReadableId: `${orderNumber.toString().padStart(4, "0")}.2026` };
}

async function session(role: "USER" | "ADMIN" = "USER") {
  const suffix = createRandomToken(8);
  const token = createRandomToken(48);
  const course = await prisma.course.upsert({
    where: { slug: "admin-user-orders-course" },
    create: { name: "Curso de pedidos por usuario", slug: "admin-user-orders-course", canPurchase: true },
    update: { canPurchase: true, deletedAt: null }
  });
  const user = await prisma.user.create({
    data: {
      googleSubject: `admin-user-orders-${role.toLowerCase()}-${suffix}`,
      name: `${role} Orders User`,
      email: `admin-user-orders-${role.toLowerCase()}-${suffix}@sou.unijui.edu.br`,
      role,
      courseId: course.id,
      courseConfirmedAt: new Date()
    }
  });
  await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
  return { user, headers: { cookie: `ca_session=${token}` } };
}

async function orderForUser(userId: string) {
  const suffix = createRandomToken(6);
  const product = await prisma.product.create({
    data: {
      name: `Produto resumo ${suffix}`,
      slug: `produto-resumo-${suffix}`,
      description: "Produto para resumo de pedido",
      costPrice: 10,
      salePrice: 35,
      active: true,
      variants: { create: { name: "M", active: true } }
    },
    include: { variants: true }
  });
  return prisma.order.create({
    data: {
      publicId: createRandomToken(18),
      ...humanOrderFields(),
      userId,
      paymentStatus: "PENDING",
      fulfillmentStatus: "WAITING_PAYMENT",
      subtotal: 70,
      total: 70,
      items: {
        create: {
          productId: product.id,
          productVariantId: product.variants[0]!.id,
          productNameSnapshot: product.name,
          variantNameSnapshot: "M",
          unitPrice: 35,
          quantity: 2,
          totalPrice: 70
        }
      },
      payments: {
        create: {
          idempotencyKey: hashToken(`admin-user-orders-${suffix}`),
          provider: "ASAAS",
          method: "PIX",
          status: "PENDING",
          amount: 70,
          pixQrCodeImage: "base64-qr-code",
          pixCopyPasteCode: "000201010212PIX-COPIA-E-COLA",
          pixExpiresAt: new Date("2026-08-27T15:00:00.000Z")
        }
      }
    }
  });
}

describe("admin user order summaries", () => {
  it("minimizes the admin user list and exposes details only to admins", async () => {
    const app = buildApp();
    const buyer = await session();
    const admin = await session("ADMIN");

    const listed = await app.inject({ method: "GET", url: "/admin/users", headers: admin.headers });
    expect(listed.statusCode).toBe(200);
    const listedUser = listed.json().users.find((entry: { id: string }) => entry.id === buyer.user.id);
    expect(listedUser).toMatchObject({
      id: buyer.user.id,
      name: buyer.user.name,
      role: "USER",
      createdAt: expect.any(String)
    });
    expect(listedUser).not.toHaveProperty("email");
    expect(listedUser).not.toHaveProperty("avatarUrl");
    expect(listedUser).not.toHaveProperty("googleSubject");
    expect(listedUser).not.toHaveProperty("courseId");
    expect(listedUser).not.toHaveProperty("courseConfirmedAt");

    const detail = await app.inject({ method: "GET", url: `/admin/users/${buyer.user.id}`, headers: admin.headers });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().user).toMatchObject({
      id: buyer.user.id,
      email: buyer.user.email
    });
    expect(detail.json().user).not.toHaveProperty("avatarUrl");
    expect(detail.json().user).not.toHaveProperty("googleSubject");

    const denied = await app.inject({ method: "GET", url: `/admin/users/${buyer.user.id}`, headers: buyer.headers });
    expect(denied.statusCode).toBe(403);
    await app.close();
  });

  it("exposes pending pix data to buyers and individual order summaries to admins", async () => {
    const app = buildApp();
    const buyer = await session();
    const otherBuyer = await session();
    const admin = await session("ADMIN");
    const order = await orderForUser(buyer.user.id);
    await orderForUser(otherBuyer.user.id);

    const buyerOrders = await app.inject({ method: "GET", url: "/orders", headers: buyer.headers });
    expect(buyerOrders.statusCode).toBe(200);
    expect(buyerOrders.json().orders[0]).toMatchObject({
      publicId: order.publicId,
      payment: {
        status: "PENDING",
        amount: 70,
        pixQrCodeImage: "base64-qr-code",
        pixCopyPasteCode: "000201010212PIX-COPIA-E-COLA"
      }
    });

    const adminOrders = await app.inject({ method: "GET", url: `/admin/users/${buyer.user.id}/orders`, headers: admin.headers });
    expect(adminOrders.statusCode).toBe(200);
    expect(adminOrders.json().orders).toHaveLength(1);
    expect(adminOrders.json().orders[0]).toMatchObject({
      publicId: order.publicId,
      total: 70,
      items: [{ productNameSnapshot: expect.stringContaining("Produto resumo"), variantNameSnapshot: "M", quantity: 2, totalPrice: 70 }]
    });

    const denied = await app.inject({ method: "GET", url: `/admin/users/${buyer.user.id}/orders`, headers: buyer.headers });
    expect(denied.statusCode).toBe(403);
    await app.close();
  });
});
