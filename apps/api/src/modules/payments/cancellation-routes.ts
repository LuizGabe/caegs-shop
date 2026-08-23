import type { PaymentStatus } from "@prisma/client";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { auditRequestContext } from "../../lib/audit.js";
import { prisma } from "../../plugins/prisma.js";
import { requireAdmin } from "../auth/guards.js";
import type { EmailService } from "../email/service.js";
import { PaymentProviderError } from "./asaas.js";
import type { PaymentProvider } from "./provider.js";

const paramsSchema = z.object({ publicId: z.string().min(10).max(100) });
const bodySchema = z.object({ reason: z.string().trim().min(3).max(500) });

type CancellationClaim = {
  operation: "DELETE" | "REFUND" | "LOCAL";
  paymentId: string | null;
  providerPaymentId: string | null;
  previousPaymentStatus: PaymentStatus;
  order: { id: string; publicId: string; user: { id: string; name: string; email: string } };
};

export function cancellationRoutes(provider: PaymentProvider, emailService: EmailService): FastifyPluginAsync {
  return async (app) => {
    app.post("/admin/orders/:publicId/cancel", { preHandler: requireAdmin }, async (request, reply) => {
      const { publicId } = paramsSchema.parse(request.params);
      const { reason } = bodySchema.parse(request.body);
      const actorUserId = request.currentUser!.id;
      const claim = await claimCancellation(publicId, actorUserId, reason, request);

      if (claim === "NOT_FOUND") {
        return reply.status(404).send({ error: { code: "ORDER_NOT_FOUND", message: "Pedido nao encontrado." } });
      }
      if (claim === "ALREADY_CANCELLED") return { status: "CANCELLED" };
      if (claim === "IN_PROGRESS") {
        return reply.status(409).send({ error: { code: "CANCELLATION_IN_PROGRESS", message: "O cancelamento ja esta em processamento." } });
      }

      try {
        if (claim.operation === "REFUND") {
          await provider.refundPayment(claim.providerPaymentId!, `Cancelamento do pedido ${claim.order.publicId}: ${reason}`);
        } else if (claim.operation === "DELETE") {
          await provider.deletePayment(claim.providerPaymentId!);
        }
      } catch (error) {
        await handleProviderFailure(claim, error, actorUserId, request);
        throw error;
      }

      const paymentStatus = claim.operation === "REFUND" ? "REFUND_PENDING" : "CANCELLED";
      await finalizeCancellation(claim, paymentStatus, actorUserId, reason, request);
      await emailService.notify({
        type: "ORDER_CANCELLED",
        deduplicationKey: `ORDER_CANCELLED:${claim.order.id}`,
        userId: claim.order.user.id,
        orderId: claim.order.id,
        to: claim.order.user.email,
        name: claim.order.user.name,
        orderPublicId: claim.order.publicId
      });

      return { status: "CANCELLED", paymentStatus };
    });
  };
}

async function claimCancellation(publicId: string, actorUserId: string, reason: string, request: FastifyRequest) {
  return prisma.$transaction(async (tx): Promise<CancellationClaim | "NOT_FOUND" | "ALREADY_CANCELLED" | "IN_PROGRESS"> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${publicId}))`;
    const order = await tx.order.findUnique({
      where: { publicId },
      include: { user: { select: { id: true, name: true, email: true } }, payments: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
    if (!order) return "NOT_FOUND";
    if (order.fulfillmentStatus === "CANCELLED") return "ALREADY_CANCELLED";
    const payment = order.payments[0];
    if (!payment?.providerPaymentId) {
      return {
        operation: "LOCAL",
        paymentId: payment?.id ?? null,
        providerPaymentId: null,
        previousPaymentStatus: payment?.status ?? order.paymentStatus,
        order: { id: order.id, publicId: order.publicId, user: order.user }
      };
    }
    if (payment.status === "REFUND_PENDING") return "IN_PROGRESS";
    if (payment.status === "REFUNDED" || payment.status === "CANCELLED") {
      await finalizeLocalCancellation(tx, order, actorUserId, reason, request);
      return "ALREADY_CANCELLED";
    }
    if (payment.status !== "PENDING" && payment.status !== "CONFIRMED") {
      throw Object.assign(new Error("Este pagamento nao pode ser cancelado no estado atual."), { statusCode: 409 });
    }

    await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUND_PENDING" } });
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUND_PENDING" } });
    await tx.auditLog.create({ data: {
      actorUserId,
      action: payment.status === "CONFIRMED" ? "PAYMENT_REFUND_REQUESTED" : "PAYMENT_CANCELLATION_REQUESTED",
      entityType: "Payment",
      entityId: payment.id,
      metadata: { orderId: order.id, reason },
      ...auditRequestContext(request)
    } });
    return {
      operation: payment.status === "CONFIRMED" ? "REFUND" : "DELETE",
      paymentId: payment.id,
      providerPaymentId: payment.providerPaymentId,
      previousPaymentStatus: payment.status,
      order: { id: order.id, publicId: order.publicId, user: order.user }
    };
  });
}

async function finalizeLocalCancellation(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], order: {
  id: string;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: "WAITING_PAYMENT" | "PAID" | "WAITING_PRODUCTION" | "IN_PRODUCTION" | "RECEIVED_FROM_SUPPLIER" | "READY_FOR_PICKUP" | "PICKED_UP" | "CANCELLED";
}, actorUserId: string, reason: string, request: FastifyRequest) {
  await tx.order.update({ where: { id: order.id }, data: { fulfillmentStatus: "CANCELLED", cancelledAt: new Date(), cancelledByUserId: actorUserId, cancellationReason: reason } });
  await tx.orderStatusHistory.create({ data: {
    orderId: order.id,
    previousPaymentStatus: order.paymentStatus,
    newPaymentStatus: order.paymentStatus,
    previousFulfillmentStatus: order.fulfillmentStatus,
    newFulfillmentStatus: "CANCELLED",
    changedByUserId: actorUserId,
    source: "ADMIN",
    note: reason
  } });
  await tx.auditLog.create({ data: { actorUserId, action: "ORDER_CANCELLED", entityType: "Order", entityId: order.id, metadata: { reason }, ...auditRequestContext(request) } });
}

async function finalizeCancellation(claim: CancellationClaim, paymentStatus: "REFUND_PENDING" | "CANCELLED", actorUserId: string, reason: string, request: FastifyRequest) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: claim.order.id } });
    if (claim.paymentId) await tx.payment.update({ where: { id: claim.paymentId }, data: { status: paymentStatus } });
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus, fulfillmentStatus: "CANCELLED", cancelledAt: new Date(), cancelledByUserId: actorUserId, cancellationReason: reason } });
    await tx.orderStatusHistory.create({ data: {
      orderId: order.id,
      previousPaymentStatus: claim.previousPaymentStatus,
      newPaymentStatus: paymentStatus,
      previousFulfillmentStatus: order.fulfillmentStatus,
      newFulfillmentStatus: "CANCELLED",
      changedByUserId: actorUserId,
      source: "ADMIN",
      note: reason
    } });
    await tx.auditLog.create({ data: {
      actorUserId,
      action: "ORDER_CANCELLED",
      entityType: "Order",
      entityId: order.id,
      metadata: { reason, paymentStatus },
      ...auditRequestContext(request)
    } });
  });
}

async function handleProviderFailure(claim: CancellationClaim, error: unknown, actorUserId: string, request: FastifyRequest) {
  const uncertain = error instanceof PaymentProviderError && error.uncertain;
  await prisma.$transaction(async (tx) => {
    if (!uncertain) {
      if (claim.paymentId) await tx.payment.updateMany({ where: { id: claim.paymentId, status: "REFUND_PENDING" }, data: { status: claim.previousPaymentStatus } });
      await tx.order.updateMany({ where: { id: claim.order.id, paymentStatus: "REFUND_PENDING" }, data: { paymentStatus: claim.previousPaymentStatus } });
    }
    await tx.auditLog.create({ data: {
      actorUserId,
      action: uncertain ? "PAYMENT_CANCELLATION_UNCERTAIN" : "PAYMENT_CANCELLATION_FAILED",
      entityType: "Payment",
      entityId: claim.paymentId ?? claim.order.id,
      metadata: { orderId: claim.order.id },
      ...auditRequestContext(request)
    } });
  });
}
