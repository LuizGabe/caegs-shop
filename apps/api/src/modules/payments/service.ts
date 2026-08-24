import type { Prisma } from "@prisma/client";

export const paymentInclude = {
  order: {
    include: {
      items: { orderBy: { createdAt: "asc" } },
      user: { select: { id: true, name: true, email: true } }
    }
  }
} satisfies Prisma.PaymentInclude;

type PaymentForApiInput = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export function paymentForApi(payment: PaymentForApiInput) {
  return {
    id: payment.id,
    orderPublicId: payment.order.publicId,
    orderHumanReadableId: payment.order.humanReadableId,
    orderNumber: payment.order.orderNumber,
    orderYear: payment.order.orderYear,
    provider: payment.provider,
    method: payment.method,
    status: payment.status,
    amount: Number(payment.amount),
    pixQrCodeImage: payment.pixQrCodeImage,
    pixCopyPasteCode: payment.pixCopyPasteCode,
    pixExpiresAt: payment.pixExpiresAt,
    createdAt: payment.createdAt,
    confirmedAt: payment.confirmedAt,
    refundedAt: payment.refundedAt
  };
}

