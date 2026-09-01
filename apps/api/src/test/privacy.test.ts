import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const env = readFileSync(join(process.cwd(), "..", "..", ".env"), "utf8");
for (const line of env.split(/\r?\n/)) {
  const [key, ...values] = line.split("=");
  if (key && values.length && process.env[key] === undefined) process.env[key] = values.join("=").replace(/\$\$/g, "$");
}

const { prisma } = await import("../plugins/prisma.js");
const { createRandomToken, hashToken } = await import("../lib/crypto.js");
const { anonymizeUser } = await import("../modules/privacy/anonymize-user.js");
const { cleanupPrivacyData } = await import("../modules/privacy/cleanup.js");

function oldDate(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function humanOrderFields() {
  const orderNumber = Number.parseInt(createRandomToken(8).slice(0, 6), 36);
  return { orderYear: 2026, orderNumber, humanReadableId: `${orderNumber.toString().padStart(4, "0")}.2026` };
}

async function orderFixture(userId: string, courseNameSnapshot = "Curso snapshot") {
  const suffix = createRandomToken(8);
  const product = await prisma.product.create({
    data: {
      name: `Produto privacidade ${suffix}`,
      slug: `produto-privacidade-${suffix}`,
      description: "Produto para teste de privacidade",
      costPrice: 10,
      salePrice: 20,
      variants: { create: { name: "M" } }
    },
    include: { variants: true }
  });
  return prisma.order.create({
    data: {
      publicId: createRandomToken(18),
      ...humanOrderFields(),
      userId,
      courseNameSnapshot,
      paymentStatus: "CONFIRMED",
      fulfillmentStatus: "PAID",
      subtotal: 20,
      total: 20,
      items: {
        create: {
          productId: product.id,
          productVariantId: product.variants[0]!.id,
          productNameSnapshot: product.name,
          variantNameSnapshot: "M",
          unitPrice: 20,
          quantity: 1,
          totalPrice: 20
        }
      },
      payments: {
        create: {
          idempotencyKey: createRandomToken(32),
          provider: "ASAAS",
          providerPaymentId: `pay-privacy-${suffix}`,
          method: "PIX",
          status: "CONFIRMED",
          amount: 20,
          confirmedAt: new Date()
        }
      }
    },
    include: { items: true, payments: true }
  });
}

describe("privacy controls", () => {
  it("anonymizes user identity without breaking order and payment history", async () => {
    const suffix = createRandomToken(8);
    const course = await prisma.course.create({ data: { name: "Curso anonimizado", slug: `curso-anon-${suffix}`, canPurchase: true } });
    const user = await prisma.user.create({
      data: {
        googleSubject: `google-anon-${suffix}`,
        name: "Nome Original",
        email: `original-${suffix}@sou.unijui.edu.br`,
        avatarUrl: "https://example.invalid/avatar.png",
        courseId: course.id,
        courseConfirmedAt: new Date()
      }
    });
    const token = createRandomToken(48);
    await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
    const order = await orderFixture(user.id, course.name);

    const result = await anonymizeUser({ userId: user.id, reason: "Solicitacao do titular" });
    expect(result.anonymized).toBe(true);
    expect(result.user).toMatchObject({
      id: user.id,
      googleSubject: null,
      name: "Usuario removido",
      avatarUrl: null,
      courseId: null,
      courseConfirmedAt: null
    });
    expect(result.user.email).not.toBe(user.email);
    expect(result.user.email).toMatch(/^deleted\+.+@privacy\.invalid$/);
    expect(result.user.anonymizedAt).toBeInstanceOf(Date);
    expect(result.user.deletedAt).toBeInstanceOf(Date);
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);

    const preserved = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, payments: true, user: true } });
    expect(preserved.userId).toBe(user.id);
    expect(preserved.courseNameSnapshot).toBe(course.name);
    expect(preserved.items).toHaveLength(1);
    expect(preserved.payments).toHaveLength(1);
    expect(preserved.user.email).not.toBe(user.email);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityType: "User", entityId: user.id, action: "USER_ANONYMIZED" } });
    expect(audit.metadata).toEqual({ reason: "Solicitacao do titular" });
    expect(JSON.stringify(audit.metadata)).not.toContain(user.email);
    expect(JSON.stringify(audit.metadata)).not.toContain(user.name);

    const repeated = await anonymizeUser({ userId: user.id, reason: "Solicitacao do titular" });
    expect(repeated.alreadyAnonymized).toBe(true);
  });

  it("supports dry-run and minimizes retained technical data idempotently", async () => {
    const suffix = createRandomToken(8);
    const user = await prisma.user.create({ data: { googleSubject: `cleanup-user-${suffix}`, name: "Cleanup User", email: `cleanup-${suffix}@sou.unijui.edu.br` } });
    const order = await orderFixture(user.id);
    const oldToken = createRandomToken(48);
    const recentToken = createRandomToken(48);
    await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(oldToken), expiresAt: oldDate(45) } });
    await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(recentToken), expiresAt: new Date(Date.now() + 60_000) } });
    const audit = await prisma.auditLog.create({
      data: { action: "CLEANUP_TEST", entityType: "Test", ipAddress: "203.0.113.10", userAgent: "Privacy Test", createdAt: oldDate(120) }
    });
    const webhook = await prisma.webhookEvent.create({
      data: { provider: "ASAAS", providerEventId: `evt-cleanup-${suffix}`, eventType: "PAYMENT_RECEIVED", payload: { payment: { id: "pay" } }, errorMessage: "erro tecnico", receivedAt: oldDate(200) }
    });
    const recentWebhook = await prisma.webhookEvent.create({
      data: { provider: "ASAAS", providerEventId: `evt-recent-${suffix}`, eventType: "PAYMENT_RECEIVED", payload: { payment: { id: "pay-recent" } }, receivedAt: new Date() }
    });
    const emailEvent = await prisma.emailEvent.create({
      data: { deduplicationKey: `email-cleanup-${suffix}`, userId: user.id, orderId: order.id, type: "PAYMENT_CONFIRMED", enabledAtEvent: true, provider: "RESEND", providerId: `email-${suffix}`, errorMessage: "falha", createdAt: oldDate(200) }
    });
    const oldPayment = await prisma.payment.create({
      data: {
        orderId: order.id,
        idempotencyKey: createRandomToken(32),
        provider: "ASAAS",
        providerPaymentId: `pay-terminal-${suffix}`,
        method: "PIX",
        status: "CONFIRMED",
        amount: 20,
        pixQrCodeImage: "base64",
        pixCopyPasteCode: "pix-code",
        confirmedAt: oldDate(45),
        updatedAt: oldDate(45)
      }
    });
    const pendingPayment = await prisma.payment.create({
      data: {
        orderId: order.id,
        idempotencyKey: createRandomToken(32),
        provider: "ASAAS",
        providerPaymentId: `pay-pending-${suffix}`,
        method: "PIX",
        status: "PENDING",
        amount: 20,
        pixQrCodeImage: "base64-pending",
        pixCopyPasteCode: "pix-code-pending",
        pixExpiresAt: oldDate(45),
        updatedAt: oldDate(45)
      }
    });

    const before = await prisma.session.count();
    const dryRun = await cleanupPrivacyData({ dryRun: true });
    expect(dryRun.sessionsToDelete).toBeGreaterThanOrEqual(1);
    expect(await prisma.session.count()).toBe(before);

    await cleanupPrivacyData();
    expect(await prisma.session.findFirst({ where: { tokenHash: hashToken(oldToken) } })).toBeNull();
    expect(await prisma.session.findFirst({ where: { tokenHash: hashToken(recentToken) } })).not.toBeNull();
    expect(await prisma.auditLog.findUniqueOrThrow({ where: { id: audit.id } })).toMatchObject({ ipAddress: null, userAgent: null });
    expect(await prisma.webhookEvent.findUniqueOrThrow({ where: { id: webhook.id } })).toMatchObject({ payload: null, errorMessage: null });
    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: recentWebhook.id } })).payload).toEqual({ payment: { id: "pay-recent" } });
    expect(await prisma.emailEvent.findUniqueOrThrow({ where: { id: emailEvent.id } })).toMatchObject({ userId: null, orderId: null, providerId: null, errorMessage: null });
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: oldPayment.id } })).toMatchObject({ pixQrCodeImage: null, pixCopyPasteCode: null });
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: pendingPayment.id } })).toMatchObject({ pixQrCodeImage: "base64-pending", pixCopyPasteCode: "pix-code-pending" });

    const second = await cleanupPrivacyData();
    expect(second.sessionsToDelete).toBe(0);
    expect(second.auditLogsToMinimize).toBe(0);
  });
});
