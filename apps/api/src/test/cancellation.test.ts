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
const { PaymentProviderError } = await import("../modules/payments/asaas.js");
import type { EmailService } from "../modules/email/service.js";
import type { PaymentProvider } from "../modules/payments/provider.js";

const emailService = { notify: vi.fn(async () => undefined) } satisfies EmailService;

function provider() {
  return {
    createPixPayment: vi.fn(),
    getPixQrCode: vi.fn(),
    deletePayment: vi.fn(async () => undefined),
    refundPayment: vi.fn(async () => undefined)
  } satisfies PaymentProvider;
}

async function session(role: "USER" | "ADMIN") {
  const suffix = createRandomToken(8);
  const token = createRandomToken(48);
  const user = await prisma.user.create({
    data: {
      googleSubject: `cancel-${role}-${suffix}`,
      name: `${role} Cancelamento`,
      email: `cancel-${role.toLowerCase()}-${suffix}@sou.unijui.edu.br`,
      role
    }
  });
  await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
  return { user, cookie: `ca_session=${token}` };
}

async function order(paymentStatus: "PENDING" | "CONFIRMED") {
  const buyer = await session("USER");
  const suffix = createRandomToken(10);
  return prisma.order.create({
    data: {
      publicId: `CANCEL-${suffix}`,
      userId: buyer.user.id,
      paymentStatus,
      fulfillmentStatus: paymentStatus === "CONFIRMED" ? "PAID" : "WAITING_PAYMENT",
      subtotal: 75,
      total: 75,
      payments: {
        create: {
          idempotencyKey: `cancel-${suffix}`,
          provider: "ASAAS",
          providerPaymentId: `pay_${suffix}`,
          method: "PIX",
          status: paymentStatus,
          amount: 75,
          confirmedAt: paymentStatus === "CONFIRMED" ? new Date() : null
        }
      }
    },
    include: { payments: true }
  });
}

describe("admin order cancellation", () => {
  it("requests one Asaas refund for a confirmed PIX and remains idempotent", async () => {
    const paymentProvider = provider();
    const app = buildApp({ paymentProvider, emailService });
    const admin = await session("ADMIN");
    const target = await order("CONFIRMED");
    const request = { method: "POST" as const, url: `/admin/orders/${target.publicId}/cancel`, headers: { cookie: admin.cookie }, payload: { reason: "Solicitacao do comprador" } };

    const first = await app.inject(request);
    const second = await app.inject(request);

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUND_PENDING" });
    expect(second.statusCode).toBe(200);
    expect(paymentProvider.refundPayment).toHaveBeenCalledTimes(1);
    expect(paymentProvider.deletePayment).not.toHaveBeenCalled();
    expect(await prisma.order.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ paymentStatus: "REFUND_PENDING", fulfillmentStatus: "CANCELLED" });
    expect(await prisma.auditLog.count({ where: { entityId: target.id, action: "ORDER_CANCELLED" } })).toBe(1);
    await app.close();
  });

  it("deletes a pending Asaas charge before cancelling locally", async () => {
    const paymentProvider = provider();
    const app = buildApp({ paymentProvider, emailService });
    const admin = await session("ADMIN");
    const target = await order("PENDING");
    const response = await app.inject({ method: "POST", url: `/admin/orders/${target.publicId}/cancel`, headers: { cookie: admin.cookie }, payload: { reason: "Pedido duplicado" } });
    expect(response.statusCode).toBe(200);
    expect(paymentProvider.deletePayment).toHaveBeenCalledOnce();
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: target.payments[0]!.id } })).toMatchObject({ status: "CANCELLED" });
    await app.close();
  });

  it("rejects regular users and restores status after a definitive provider rejection", async () => {
    const paymentProvider = provider();
    paymentProvider.refundPayment.mockRejectedValue(new PaymentProviderError("Operacao rejeitada."));
    const app = buildApp({ paymentProvider, emailService });
    const regular = await session("USER");
    const admin = await session("ADMIN");
    const target = await order("CONFIRMED");
    const payload = { reason: "Teste de autorizacao" };
    expect((await app.inject({ method: "POST", url: `/admin/orders/${target.publicId}/cancel`, headers: { cookie: regular.cookie }, payload })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `/admin/orders/${target.publicId}/cancel`, headers: { cookie: admin.cookie }, payload })).statusCode).toBe(502);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ paymentStatus: "CONFIRMED", fulfillmentStatus: "PAID" });
    await app.close();
  });
});
