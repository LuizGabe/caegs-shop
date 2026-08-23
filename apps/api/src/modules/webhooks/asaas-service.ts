import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../plugins/prisma.js";
import type { EmailNotification, EmailService } from "../email/service.js";

export const asaasWebhookSchema = z.object({
  id: z.string().trim().min(1).max(200),
  event: z.string().trim().min(1).max(100),
  payment: z.object({
    id: z.string().trim().min(1).max(200),
    billingType: z.string().trim().max(50).optional(),
    value: z.coerce.number().positive().finite().optional(),
    status: z.string().trim().max(50).optional()
  }).passthrough()
}).passthrough();

export type AsaasWebhook = z.infer<typeof asaasWebhookSchema>;

class WebhookValidationError extends Error {
  statusCode = 400;
}

export async function receiveAsaasWebhook(event: AsaasWebhook, emailService: EmailService) {
  let duplicate = false;
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: "ASAAS",
        providerEventId: event.id,
        eventType: event.event,
        payload: minimizedPayload(event)
      }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    duplicate = true;
  }

  try {
    const processed = await processAsaasWebhook(event);
    if (processed.notification) await emailService.notify(processed.notification);
    return { duplicate: duplicate || processed.alreadyProcessed };
  } catch (error) {
    await prisma.webhookEvent.updateMany({
      where: { provider: "ASAAS", providerEventId: event.id },
      data: {
        processingStatus: "FAILED",
        errorMessage: errorMessageForStorage(error)
      }
    });
    throw error;
  }
}

async function processAsaasWebhook(event: AsaasWebhook) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ASAAS:${event.id}`}))`;
    const stored = await tx.webhookEvent.findUniqueOrThrow({
      where: { provider_providerEventId: { provider: "ASAAS", providerEventId: event.id } }
    });
    if (stored.processingStatus === "PROCESSED" || stored.processingStatus === "IGNORED") {
      return { alreadyProcessed: true, notification: null };
    }

    const payment = await tx.payment.findUnique({
      where: { providerPaymentId: event.payment.id },
      include: { order: { include: { user: { select: { id: true, name: true, email: true } } } } }
    });
    if (!payment) {
      await tx.webhookEvent.update({
        where: { id: stored.id },
        data: { processedAt: new Date(), processingStatus: "IGNORED", errorMessage: null }
      });
      return { alreadyProcessed: false, notification: null };
    }
    validatePaymentPayload(event, payment.amount);

    const nextStatus = paymentStatusForEvent(event.event);
    let notification: EmailNotification | null = null;
    if (nextStatus && nextStatus !== payment.status) {
      const now = new Date();
      const nextFulfillment = nextStatus === "CONFIRMED" ? "PAID" : payment.order.fulfillmentStatus;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: nextStatus,
          confirmedAt: nextStatus === "CONFIRMED" ? now : payment.confirmedAt,
          refundedAt: nextStatus === "REFUNDED" ? now : payment.refundedAt
        }
      });
      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: nextStatus, fulfillmentStatus: nextFulfillment }
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: payment.orderId,
          previousPaymentStatus: payment.order.paymentStatus,
          newPaymentStatus: nextStatus,
          previousFulfillmentStatus: payment.order.fulfillmentStatus,
          newFulfillmentStatus: nextFulfillment,
          source: "WEBHOOK",
          note: `Asaas: ${event.event}`
        }
      });
      await tx.auditLog.create({ data: {
        action: nextStatus === "CONFIRMED" ? "PAYMENT_CONFIRMED" : nextStatus === "REFUNDED" ? "PAYMENT_REFUNDED" : nextStatus === "REFUND_PENDING" ? "PAYMENT_REFUND_PENDING" : "PAYMENT_CANCELLED",
        entityType: "Payment",
        entityId: payment.id,
        metadata: { provider: "ASAAS", providerEventId: event.id, previousStatus: payment.status, newStatus: nextStatus }
      } });
      if (nextStatus === "CONFIRMED" || nextStatus === "REFUNDED") {
        const type = nextStatus === "CONFIRMED" ? "PAYMENT_CONFIRMED" : "PAYMENT_REFUNDED";
        notification = {
          type,
          deduplicationKey: `${type}:${payment.id}`,
          userId: payment.order.user.id,
          orderId: payment.order.id,
          to: payment.order.user.email,
          name: payment.order.user.name,
          orderPublicId: payment.order.publicId
        };
      }
    }

    await tx.webhookEvent.update({
      where: { id: stored.id },
      data: { processedAt: new Date(), processingStatus: "PROCESSED", errorMessage: null }
    });
    return { alreadyProcessed: false, notification };
  });
}

function validatePaymentPayload(event: AsaasWebhook, amount: Prisma.Decimal) {
  if (event.payment.billingType && event.payment.billingType !== "PIX") {
    throw new WebhookValidationError("Forma de pagamento inesperada no webhook.");
  }
  if (event.payment.value !== undefined && new Prisma.Decimal(event.payment.value).comparedTo(amount) !== 0) {
    throw new WebhookValidationError("Valor divergente no webhook.");
  }
}

function paymentStatusForEvent(eventType: string) {
  if (eventType === "PAYMENT_RECEIVED") return "CONFIRMED" as const;
  if (eventType === "PAYMENT_REFUNDED") return "REFUNDED" as const;
  if (eventType === "PAYMENT_REFUND_IN_PROGRESS") return "REFUND_PENDING" as const;
  if (eventType === "PAYMENT_DELETED") return "CANCELLED" as const;
  return null;
}

function minimizedPayload(event: AsaasWebhook): Prisma.InputJsonValue {
  return {
    payment: {
      id: event.payment.id,
      ...(event.payment.billingType ? { billingType: event.payment.billingType } : {}),
      ...(event.payment.value !== undefined ? { value: event.payment.value } : {}),
      ...(event.payment.status ? { status: event.payment.status } : {})
    }
  };
}

function errorMessageForStorage(error: unknown) {
  return error instanceof WebhookValidationError
    ? error.message.slice(0, 500)
    : "Falha tecnica durante o processamento do webhook.";
}
