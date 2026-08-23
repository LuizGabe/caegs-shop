import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const env = readFileSync(join(process.cwd(), "..", "..", ".env"), "utf8");
for (const line of env.split(/\r?\n/)) {
  const [key, ...values] = line.split("=");
  if (key && values.length && process.env[key] === undefined) process.env[key] = values.join("=").replace(/\$\$/g, "$");
}

const { prisma } = await import("../plugins/prisma.js");
const { createRandomToken } = await import("../lib/crypto.js");
const { DatabaseEmailService } = await import("../modules/email/service.js");
const { renderEmail } = await import("../modules/email/templates.js");

function notification(deduplicationKey: string) {
  return {
    type: "PAYMENT_CONFIRMED" as const,
    deduplicationKey,
    userId: "email-test-user",
    orderId: "email-test-order",
    to: "user@sou.unijui.edu.br",
    name: "Usuario Teste",
    orderPublicId: "ORDER-TEST"
  };
}

describe("email service", () => {
  it("does not send while disabled and deduplicates events", async () => {
    const suffix = createRandomToken(8);
    const settingKey = `emailsEnabled:test:${suffix}`;
    const deduplicationKey = `PAYMENT_CONFIRMED:${suffix}`;
    await prisma.appSetting.create({ data: { key: settingKey, value: false } });
    const transport = { send: vi.fn(async () => ({ id: "email_1" })) };
    const service = new DatabaseEmailService(transport, settingKey);
    await service.notify(notification(deduplicationKey));
    await service.notify(notification(deduplicationKey));
    expect(transport.send).not.toHaveBeenCalled();
    expect(await prisma.emailEvent.count({ where: { deduplicationKey } })).toBe(1);
    expect(await prisma.emailEvent.findUniqueOrThrow({ where: { deduplicationKey } })).toMatchObject({ enabledAtEvent: false, sentAt: null });
  });

  it("stores provider failures without rejecting the business flow", async () => {
    const suffix = createRandomToken(8);
    const settingKey = `emailsEnabled:test:${suffix}`;
    const deduplicationKey = `PAYMENT_REFUNDED:${suffix}`;
    await prisma.appSetting.create({ data: { key: settingKey, value: true } });
    const service = new DatabaseEmailService({ send: vi.fn(async () => { throw new Error("provider unavailable"); }) }, settingKey);
    await expect(service.notify({ ...notification(deduplicationKey), type: "PAYMENT_REFUNDED" })).resolves.toBeUndefined();
    expect(await prisma.emailEvent.findUniqueOrThrow({ where: { deduplicationKey } })).toMatchObject({ enabledAtEvent: true, provider: "RESEND", sentAt: null, errorMessage: "provider unavailable" });
  });

  it("escapes dynamic HTML in templates", () => {
    const rendered = renderEmail({ type: "ORDER_READY_FOR_PICKUP", name: "<script>alert(1)</script>", orderPublicId: "ORDER-1", pickupLocation: "Sala <b>1</b>" });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<b>1</b>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });
});
