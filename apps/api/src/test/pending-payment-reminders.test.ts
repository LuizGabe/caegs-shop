import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const env = readFileSync(join(process.cwd(), "..", "..", ".env"), "utf8");
for (const line of env.split(/\r?\n/)) {
  const [key, ...values] = line.split("=");
  if (key && values.length && process.env[key] === undefined) process.env[key] = values.join("=").replace(/\$\$/g, "$");
}

const { buildApp } = await import("../app.js");
const { prisma } = await import("../plugins/prisma.js");
const { createRandomToken, hashToken } = await import("../lib/crypto.js");

function humanOrderFields(offset = 0) {
  const orderNumber = Number.parseInt(createRandomToken(8).slice(0, 6), 36) + offset;
  return { orderYear: 2026, orderNumber, humanReadableId: `${orderNumber.toString().padStart(4, "0")}.2026` };
}

async function session(role: "USER" | "ADMIN" = "USER") {
  const suffix = createRandomToken(8);
  const token = createRandomToken(48);
  const course = await prisma.course.upsert({
    where: { slug: "pending-reminders-course" },
    create: { name: "Curso de reminders", slug: "pending-reminders-course", canPurchase: true },
    update: { canPurchase: true, deletedAt: null }
  });
  const user = await prisma.user.create({
    data: {
      googleSubject: `pending-reminder-${role.toLowerCase()}-${suffix}`,
      name: `${role} Reminder User`,
      email: `pending-reminder-${role.toLowerCase()}-${suffix}@sou.unijui.edu.br`,
      role,
      courseId: course.id,
      courseConfirmedAt: new Date()
    }
  });
  await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
  return { user, headers: { cookie: `ca_session=${token}` } };
}

async function orderForUser(userId: string, paymentStatus: "PENDING" | "CONFIRMED" = "PENDING", offset = 0) {
  const suffix = createRandomToken(6);
  const product = await prisma.product.create({
    data: {
      name: `Produto reminder ${suffix}`,
      slug: `produto-reminder-${suffix}`,
      description: "Produto para reminder",
      costPrice: 10,
      salePrice: 42,
      active: true,
      variants: { create: { name: "M", active: true } }
    },
    include: { variants: true }
  });
  return prisma.order.create({
    data: {
      publicId: createRandomToken(18),
      ...humanOrderFields(offset),
      userId,
      paymentStatus,
      fulfillmentStatus: paymentStatus === "CONFIRMED" ? "PAID" : "WAITING_PAYMENT",
      subtotal: 42,
      total: 42,
      items: {
        create: {
          productId: product.id,
          productVariantId: product.variants[0]!.id,
          productNameSnapshot: product.name,
          variantNameSnapshot: "M",
          unitPrice: 42,
          quantity: 1,
          totalPrice: 42
        }
      },
      payments: {
        create: {
          idempotencyKey: hashToken(`pending-reminder-${suffix}`),
          provider: "ASAAS",
          providerPaymentId: `pending-reminder-${suffix}`,
          method: "PIX",
          status: paymentStatus,
          amount: 42,
          pixExpiresAt: new Date("2026-09-10T18:30:00.000Z"),
          confirmedAt: paymentStatus === "CONFIRMED" ? new Date() : null
        }
      }
    }
  });
}

describe("pending payment reminders", () => {
  it("lists only pending payment orders for admins", async () => {
    const app = buildApp();
    const buyer = await session();
    const admin = await session("ADMIN");
    const pending = await orderForUser(buyer.user.id, "PENDING", 1);
    await orderForUser(buyer.user.id, "CONFIRMED", 2);

    const listed = await app.inject({ method: "GET", url: "/admin/orders/pending-payment", headers: admin.headers });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().orders).toEqual(expect.arrayContaining([expect.objectContaining({ publicId: pending.publicId, paymentStatus: "PENDING" })]));
    expect(listed.json().orders).not.toEqual(expect.arrayContaining([expect.objectContaining({ paymentStatus: "CONFIRMED" })]));

    const denied = await app.inject({ method: "GET", url: "/admin/orders/pending-payment", headers: buyer.headers });
    expect(denied.statusCode).toBe(403);
    await app.close();
  });

  it("sends real and test reminders to the correct recipients", async () => {
    const notify = vi.fn(async () => undefined);
    const app = buildApp({ emailService: { notify } });
    const buyer = await session();
    const admin = await session("ADMIN");
    const order = await orderForUser(buyer.user.id);
    await prisma.appSetting.upsert({ where: { key: "emailsEnabled" }, update: { value: true }, create: { key: "emailsEnabled", value: true } });

    const real = await app.inject({ method: "POST", url: `/admin/orders/${order.publicId}/payment-reminder`, headers: admin.headers });
    expect(real.statusCode).toBe(200);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      type: "PAYMENT_PENDING_REMINDER",
      deduplicationKey: `PAYMENT_PENDING_REMINDER:${order.id}`,
      to: buyer.user.email,
      pixExpiresAt: new Date("2026-09-10T18:30:00.000Z")
    }));

    const test = await app.inject({ method: "POST", url: `/admin/orders/${order.publicId}/payment-reminder/test`, headers: admin.headers });
    expect(test.statusCode).toBe(200);
    expect(test.json().to).toBe(admin.user.email);
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "PAYMENT_PENDING_REMINDER",
      to: admin.user.email,
      userId: admin.user.id,
      name: buyer.user.name
    }));
    await app.close();
  });

  it("rejects reminders for orders that are not pending", async () => {
    const notify = vi.fn(async () => undefined);
    const app = buildApp({ emailService: { notify } });
    const buyer = await session();
    const admin = await session("ADMIN");
    const order = await orderForUser(buyer.user.id, "CONFIRMED");
    await prisma.appSetting.upsert({ where: { key: "emailsEnabled" }, update: { value: true }, create: { key: "emailsEnabled", value: true } });

    const response = await app.inject({ method: "POST", url: `/admin/orders/${order.publicId}/payment-reminder`, headers: admin.headers });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("ORDER_NOT_PENDING");
    expect(notify).not.toHaveBeenCalled();
    await app.close();
  });
});
