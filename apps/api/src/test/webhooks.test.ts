import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const env = readFileSync(join(process.cwd(), "..", "..", ".env"), "utf8");
for (const line of env.split(/\r?\n/)) {
  const [key, ...values] = line.split("=");
  if (key && values.length && process.env[key] === undefined) {
    process.env[key] = values.join("=").replace(/\$\$/g, "$");
  }
}

const { buildApp } = await import("../app.js");
const { prisma } = await import("../plugins/prisma.js");
const { createRandomToken } = await import("../lib/crypto.js");
function humanOrderFields(suffix = createRandomToken(8), offset = 0) {
  const orderNumber = (Number.parseInt(suffix.slice(0, 6), 36) % 900000) + offset;
  return { orderYear: 2026, orderNumber, humanReadableId: `${orderNumber.toString().padStart(4, "0")}.2026` };
}

async function pendingPayment(amount = 49.9) {
  const suffix = createRandomToken(8);
  const user = await prisma.user.create({
    data: {
      googleSubject: `webhook-user-${suffix}`,
      name: "Webhook User",
      email: `webhook-user-${suffix}@sou.unijui.edu.br`
    }
  });
  const order = await prisma.order.create({
    data: {
      publicId: createRandomToken(18),
      ...humanOrderFields(suffix),
      userId: user.id,
      subtotal: amount,
      total: amount
    }
  });
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      idempotencyKey: createRandomToken(32),
      provider: "ASAAS",
      providerCustomerId: `cus_${suffix}`,
      providerPaymentId: `pay_${suffix}`,
      method: "PIX",
      amount
    }
  });
  return { order, payment };
}

const headers = () => ({ "asaas-access-token": process.env.ASAAS_WEBHOOK_TOKEN! });

describe("Asaas webhooks", () => {
  it("authenticates and processes twenty duplicate deliveries exactly once", async () => {
    const app = buildApp();
    const fixture = await pendingPayment();
    const event = {
      id: `evt_${createRandomToken(12)}`,
      event: "PAYMENT_RECEIVED",
      extraCustomerData: { cpfCnpj: "must-not-be-stored" },
      payment: {
        id: fixture.payment.providerPaymentId,
        billingType: "PIX",
        value: 49.9,
        status: "RECEIVED",
        customer: "sensitive-customer-payload"
      }
    };

    const denied = await app.inject({ method: "POST", url: "/webhooks/asaas", payload: event });
    expect(denied.statusCode).toBe(401);

    const responses = await Promise.all(Array.from({ length: 20 }, () => app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: headers(),
      payload: event
    })));
    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    expect(responses.filter((response) => response.json().duplicate).length).toBeGreaterThanOrEqual(19);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: fixture.payment.id }, include: { order: true } });
    expect(payment.status).toBe("CONFIRMED");
    expect(payment.confirmedAt).not.toBeNull();
    expect(payment.order.paymentStatus).toBe("CONFIRMED");
    expect(payment.order.fulfillmentStatus).toBe("PAID");
    expect(await prisma.webhookEvent.count({ where: { providerEventId: event.id } })).toBe(1);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: fixture.order.id, source: "WEBHOOK" } })).toBe(1);

    const stored = await prisma.webhookEvent.findFirstOrThrow({ where: { providerEventId: event.id } });
    expect(stored.processingStatus).toBe("PROCESSED");
    expect(stored.payload).toEqual({ payment: { id: fixture.payment.providerPaymentId, billingType: "PIX", value: 49.9, status: "RECEIVED" } });

    const equivalentEvent = { ...event, id: `evt_${createRandomToken(12)}` };
    const equivalent = await app.inject({ method: "POST", url: "/webhooks/asaas", headers: headers(), payload: equivalentEvent });
    expect(equivalent.statusCode).toBe(200);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: fixture.order.id, source: "WEBHOOK" } })).toBe(1);
    await app.close();
  });

  it("records a failed event and safely reprocesses its retry", async () => {
    const app = buildApp();
    const fixture = await pendingPayment();
    const eventId = `evt_${createRandomToken(12)}`;
    const invalid = {
      id: eventId,
      event: "PAYMENT_RECEIVED",
      payment: { id: fixture.payment.providerPaymentId, billingType: "PIX", value: 1 }
    };
    const failed = await app.inject({ method: "POST", url: "/webhooks/asaas", headers: headers(), payload: invalid });
    expect(failed.statusCode).toBe(400);

    const storedFailure = await prisma.webhookEvent.findFirstOrThrow({ where: { providerEventId: eventId } });
    expect(storedFailure.processingStatus).toBe("FAILED");
    expect(storedFailure.errorMessage).toBe("Valor divergente no webhook.");
    expect(storedFailure.processedAt).toBeNull();

    const corrected = { ...invalid, payment: { ...invalid.payment, value: 49.9 } };
    const retried = await app.inject({ method: "POST", url: "/webhooks/asaas", headers: headers(), payload: corrected });
    expect(retried.statusCode).toBe(200);
    expect(retried.json().duplicate).toBe(true);
    const storedSuccess = await prisma.webhookEvent.findFirstOrThrow({ where: { providerEventId: eventId } });
    expect(storedSuccess.processingStatus).toBe("PROCESSED");
    expect(storedSuccess.errorMessage).toBeNull();
    expect(await prisma.orderStatusHistory.count({ where: { orderId: fixture.order.id, source: "WEBHOOK" } })).toBe(1);
    await app.close();
  });
});



