import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const env = readFileSync(join(process.cwd(), "..", "..", ".env"), "utf8");
for (const line of env.split(/\r?\n/)) {
  const [key, ...values] = line.split("=");
  if (key && values.length && process.env[key] === undefined) {
    process.env[key] = values.join("=").replace(/\$\$/g, "$");
  }
}

const { buildApp } = await import("../app.js");
const { prisma } = await import("../plugins/prisma.js");
const { createRandomToken, hashToken } = await import("../lib/crypto.js");
import type { PaymentProvider } from "../modules/payments/provider.js";

async function session(canPurchase = true) {
  const suffix = createRandomToken(8);
  const token = createRandomToken(48);
  const course = await prisma.course.upsert({
    where: { slug: canPurchase ? "payment-enabled" : "payment-disabled" },
    create: {
      name: canPurchase ? "Curso habilitado para pagamento" : "Curso bloqueado para pagamento",
      slug: canPurchase ? "payment-enabled" : "payment-disabled",
      canPurchase
    },
    update: { canPurchase }
  });
  const user = await prisma.user.create({
    data: {
      googleSubject: `payment-user-${suffix}`,
      name: "Payment User",
      email: `payment-user-${suffix}@sou.unijui.edu.br`,
      courseId: course.id,
      courseConfirmedAt: new Date()
    }
  });
  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) }
  });
  return { user, cookie: `ca_session=${token}` };
}

async function product() {
  const suffix = createRandomToken(6);
  return prisma.product.create({
    data: {
      name: `Produto PIX ${suffix}`,
      slug: `produto-pix-${suffix}`,
      description: "Produto para checkout",
      costPrice: 20,
      salePrice: 49.9,
      active: true,
      variants: { create: { name: "M", active: true } }
    },
    include: { variants: true }
  });
}

function provider() {
  return {
    createPixPayment: vi.fn(async (input) => ({
      providerCustomerId: `cus_${input.customer.id}`,
      providerPaymentId: `pay_${input.externalReference}`,
      status: "PENDING"
    })),
    getPixQrCode: vi.fn(async () => ({
      encodedImage: "base64-qr-code",
      payload: "000201010212PIX-COPIA-E-COLA",
      expirationDate: new Date(Date.now() + 3_600_000).toISOString()
    })),
    deletePayment: vi.fn(async () => undefined),
    refundPayment: vi.fn(async () => undefined)
  } satisfies PaymentProvider;
}

describe("PIX checkout", () => {
  it("creates a single order and charge for repeated idempotency keys", async () => {
    const paymentProvider = provider();
    const app = buildApp({ paymentProvider });
    const buyer = await session();
    const item = await product();
    const key = createRandomToken(24);
    const request = {
      method: "POST" as const,
      url: "/checkout",
      headers: { cookie: buyer.cookie, "idempotency-key": key },
      payload: { cpfCnpj: "24971563792", items: [{ productId: item.id, productVariantId: item.variants[0]!.id, quantity: 2 }] }
    };

    const first = await app.inject(request);
    const second = await app.inject(request);
    const third = await app.inject({ ...request, headers: { ...request.headers, "idempotency-key": createRandomToken(24) } });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(third.statusCode).toBe(201);
    expect(second.json().order.publicId).toBe(first.json().order.publicId);
    expect(first.json().order.humanReadableId).toMatch(/^\d{4,}\.\d{4}$/);
    expect(second.json().order.humanReadableId).toBe(first.json().order.humanReadableId);
    expect(second.json().payment.orderHumanReadableId).toBe(first.json().order.humanReadableId);
    const [firstNumber, firstYear] = first.json().order.humanReadableId.split(".").map(Number);
    const [thirdNumber, thirdYear] = third.json().order.humanReadableId.split(".").map(Number);
    expect(thirdYear).toBe(firstYear);
    expect(thirdNumber).toBeGreaterThan(firstNumber);
    expect(second.json().payment.id).toBe(first.json().payment.id);
    expect(first.json().payment).toMatchObject({
      method: "PIX",
      provider: "ASAAS",
      status: "PENDING",
      amount: 99.8,
      pixQrCodeImage: "base64-qr-code",
      pixCopyPasteCode: "000201010212PIX-COPIA-E-COLA"
    });
    expect(paymentProvider.createPixPayment).toHaveBeenCalledTimes(2);
    expect(paymentProvider.getPixQrCode).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it("rejects checkout for a course without purchase permission", async () => {
    const paymentProvider = provider();
    const app = buildApp({ paymentProvider });
    const buyer = await session(false);
    const item = await product();
    const response = await app.inject({
      method: "POST",
      url: "/checkout",
      headers: { cookie: buyer.cookie, "idempotency-key": createRandomToken(24) },
      payload: { cpfCnpj: "24971563792", items: [{ productId: item.id, productVariantId: item.variants[0]!.id, quantity: 1 }] }
    });
    expect(response.statusCode).toBe(403);
    expect(paymentProvider.createPixPayment).not.toHaveBeenCalled();
    await app.close();
  });

  it("does not persist an order or payment when Asaas refuses the PIX charge", async () => {
    const paymentProvider = provider();
    paymentProvider.createPixPayment.mockRejectedValueOnce(Object.assign(new Error("Asaas indisponivel"), { statusCode: 502 }));
    const app = buildApp({ paymentProvider });
    const buyer = await session();
    const item = await product();
    const ordersBefore = await prisma.order.count({ where: { userId: buyer.user.id } });
    const paymentsBefore = await prisma.payment.count({ where: { order: { userId: buyer.user.id } } });

    const response = await app.inject({
      method: "POST",
      url: "/checkout",
      headers: { cookie: buyer.cookie, "idempotency-key": createRandomToken(24) },
      payload: { cpfCnpj: "24971563792", items: [{ productId: item.id, productVariantId: item.variants[0]!.id, quantity: 1 }] }
    });

    expect(response.statusCode).toBe(502);
    await expect(prisma.order.count({ where: { userId: buyer.user.id } })).resolves.toBe(ordersBefore);
    await expect(prisma.payment.count({ where: { order: { userId: buyer.user.id } } })).resolves.toBe(paymentsBefore);
    expect(paymentProvider.getPixQrCode).not.toHaveBeenCalled();
    expect(paymentProvider.deletePayment).not.toHaveBeenCalled();
    await app.close();
  });

  it("deletes the external charge and does not persist locally when PIX QR Code creation fails", async () => {
    const paymentProvider = provider();
    paymentProvider.getPixQrCode.mockRejectedValueOnce(Object.assign(new Error("QR Code indisponivel"), { statusCode: 502 }));
    const app = buildApp({ paymentProvider });
    const buyer = await session();
    const item = await product();
    const ordersBefore = await prisma.order.count({ where: { userId: buyer.user.id } });
    const paymentsBefore = await prisma.payment.count({ where: { order: { userId: buyer.user.id } } });

    const response = await app.inject({
      method: "POST",
      url: "/checkout",
      headers: { cookie: buyer.cookie, "idempotency-key": createRandomToken(24) },
      payload: { cpfCnpj: "24971563792", items: [{ productId: item.id, productVariantId: item.variants[0]!.id, quantity: 1 }] }
    });

    expect(response.statusCode).toBe(502);
    await expect(prisma.order.count({ where: { userId: buyer.user.id } })).resolves.toBe(ordersBefore);
    await expect(prisma.payment.count({ where: { order: { userId: buyer.user.id } } })).resolves.toBe(paymentsBefore);
    expect(paymentProvider.deletePayment).toHaveBeenCalledTimes(1);
    expect(paymentProvider.deletePayment).toHaveBeenCalledWith(expect.stringMatching(/^pay_checkout:/));
    await app.close();
  });

});






