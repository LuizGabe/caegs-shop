import type { AuditLog, OrderFulfillmentStatus, Prisma, ProductionBatchStatus } from "@prisma/client";
import { createRandomToken } from "../../lib/crypto.js";

export const batchInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  orders: {
    orderBy: { createdAt: "asc" },
    include: {
      order: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          items: { orderBy: { createdAt: "asc" } }
        }
      }
    }
  }
} satisfies Prisma.ProductionBatchInclude;

export const nextBatchStatus: Record<ProductionBatchStatus, ProductionBatchStatus | null> = {
  DRAFT: "SENT_TO_PRODUCTION",
  SENT_TO_PRODUCTION: "RECEIVED",
  RECEIVED: "READY_FOR_PICKUP",
  READY_FOR_PICKUP: "CLOSED",
  CLOSED: null
};

export const orderStatusForBatch: Partial<Record<ProductionBatchStatus, OrderFulfillmentStatus>> = {
  SENT_TO_PRODUCTION: "IN_PRODUCTION",
  RECEIVED: "RECEIVED_FROM_SUPPLIER",
  READY_FOR_PICKUP: "READY_FOR_PICKUP"
};

export function createBatchCode() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `LOT-${date}-${createRandomToken(4).toUpperCase()}`;
}

export function batchSummary(batchOrders: Array<{ order: { items: Array<{ productId: string; productVariantId: string; productNameSnapshot: string; variantNameSnapshot: string; quantity: number }> } }>) {
  const products = new Map<string, { productId: string; productName: string; variants: Map<string, { productVariantId: string; variantName: string; quantity: number }> }>();
  for (const batchOrder of batchOrders) {
    for (const item of batchOrder.order.items) {
      let product = products.get(item.productId);
      if (!product) {
        product = { productId: item.productId, productName: item.productNameSnapshot, variants: new Map() };
        products.set(item.productId, product);
      }
      const variant = product.variants.get(item.productVariantId);
      if (variant) variant.quantity += item.quantity;
      else product.variants.set(item.productVariantId, { productVariantId: item.productVariantId, variantName: item.variantNameSnapshot, quantity: item.quantity });
    }
  }
  return [...products.values()].map((product) => ({
    productId: product.productId,
    productName: product.productName,
    totalQuantity: [...product.variants.values()].reduce((sum, variant) => sum + variant.quantity, 0),
    variants: [...product.variants.values()].sort((left, right) => left.variantName.localeCompare(right.variantName, "pt-BR"))
  })).sort((left, right) => left.productName.localeCompare(right.productName, "pt-BR"));
}

type BatchForApiInput = Prisma.ProductionBatchGetPayload<{ include: typeof batchInclude }>;

export function batchForApi(batch: BatchForApiInput, auditLogs: AuditLog[] = []) {
  return {
    id: batch.id,
    code: batch.code,
    name: batch.name,
    status: batch.status,
    notes: batch.notes,
    pickupLocation: batch.pickupLocation,
    pickupNotes: batch.pickupNotes,
    pickupDate: batch.pickupDate instanceof Date ? batch.pickupDate.toISOString().slice(0, 10) : null,
    pickupTime: batch.pickupTime instanceof Date ? batch.pickupTime.toISOString().slice(11, 16) : null,
    createdBy: batch.createdBy,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    closedAt: batch.closedAt,
    orders: batch.orders.map(({ order, createdAt }) => ({
      id: order.id,
      publicId: order.publicId,
      humanReadableId: order.humanReadableId,
      orderNumber: order.orderNumber,
      orderYear: order.orderYear,
      user: order.user,
      total: Number(order.total),
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      associatedAt: createdAt,
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productNameSnapshot,
        variantName: item.variantNameSnapshot,
        quantity: item.quantity
      }))
    })),
    summary: batchSummary(batch.orders),
    auditLogs
  };
}

