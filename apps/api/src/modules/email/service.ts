import { Prisma } from "@prisma/client";
import { config } from "../../config.js";
import { prisma } from "../../plugins/prisma.js";
import { renderEmail, type EmailNotificationType } from "./templates.js";

export type EmailNotification = {
  type: EmailNotificationType;
  deduplicationKey: string;
  userId: string;
  orderId: string;
  to: string;
  name: string;
  orderPublicId: string;
  orderHumanReadableId?: string | null;
  pixExpiresAt?: string | Date | null;
  pickupLocation?: string | null;
  pickupNotes?: string | null;
  pickupDate?: string | null;
  pickupTime?: string | null;
};

export interface EmailService {
  notify(notification: EmailNotification): Promise<void>;
}

export interface EmailTransport {
  send(input: { to: string; subject: string; html: string }): Promise<{ id: string }>;
}

export class DatabaseEmailService implements EmailService {
  constructor(private readonly transport: EmailTransport, private readonly settingKey = "emailsEnabled") {}

  async notify(notification: EmailNotification) {
    try {
      const setting = await prisma.appSetting.findUnique({ where: { key: this.settingKey } });
      const enabled = setting?.value === true;
      let event;
      try {
        event = await prisma.emailEvent.create({ data: {
          deduplicationKey: notification.deduplicationKey,
          userId: notification.userId,
          orderId: notification.orderId,
          type: notification.type,
          enabledAtEvent: enabled
        } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
        throw error;
      }
      if (!enabled) return;
      try {
        const template = renderEmail(notification);
        const sent = await this.transport.send({ to: notification.to, ...template });
        await prisma.emailEvent.update({ where: { id: event.id }, data: { provider: "RESEND", providerId: sent.id, sentAt: new Date(), errorMessage: null } });
      } catch (error) {
        await prisma.emailEvent.update({ where: { id: event.id }, data: { provider: "RESEND", errorMessage: safeError(error) } }).catch(() => undefined);
      }
    } catch {
      // Email infrastructure is deliberately isolated from business operations.
    }
  }
}

export class ResendEmailTransport implements EmailTransport {
  constructor(private readonly apiKey: string, private readonly from: string) {}

  async send(input: { to: string; subject: string; html: string }) {
    if (!this.apiKey) throw new Error("RESEND_API_KEY nao configurada.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [input.to], subject: input.subject, html: input.html })
    });
    const body = await response.json().catch(() => null) as { id?: unknown; message?: unknown } | null;
    if (!response.ok || typeof body?.id !== "string") throw new Error(typeof body?.message === "string" ? body.message : "Falha no envio pelo Resend.");
    return { id: body.id };
  }
}

export function createEmailService() {
  return new DatabaseEmailService(new ResendEmailTransport(config.RESEND_API_KEY ?? "", config.RESEND_FROM_EMAIL));
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Falha desconhecida no envio.").slice(0, 500);
}

