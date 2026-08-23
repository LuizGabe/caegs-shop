import type { Prisma } from "@prisma/client";

export const paymentInclude = {
  order: {
    include: {
      items: { orderBy: { createdAt: "asc" } },
      user: { select: { id: true, name: true, email: true } }
    }
  }
} satisfies Prisma.PaymentInclude;

export function paymentForApi(payment: any) {
  return {
    id: payment.id,
    orderPublicId: payment.order.publicId,
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
