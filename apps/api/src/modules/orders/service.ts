import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Order, OrderItem, ProductionBatch } from "@prisma/client";
import { createRandomToken } from "../../lib/crypto.js";
import { config } from "../../config.js";

export const orderItemInputSchema = z.object({ productId: z.string().min(1), productVariantId: z.string().min(1), quantity: z.coerce.number().int().positive().max(config.MAX_QUANTITY_PER_ITEM) });
export const createOrderSchema = z.object({ items: z.array(orderItemInputSchema).min(1).max(config.MAX_TOTAL_ITEMS_PER_ORDER) }).superRefine((data, ctx) => { const seen = new Set<string>(); data.items.forEach((item, index) => { const key = `${item.productId}:${item.productVariantId}`; if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items", index], message: "Produto e variante duplicados." }); seen.add(key); }); });
export const statusUpdateSchema = z.object({ fulfillmentStatus: z.enum(["WAITING_PAYMENT", "PAID", "WAITING_PRODUCTION", "IN_PRODUCTION", "RECEIVED_FROM_SUPPLIER", "READY_FOR_PICKUP"]), note: z.string().trim().max(500).optional() });
export const orderInclude = {
  items: { orderBy: { createdAt: "asc" } },
  statusHistory: { orderBy: { createdAt: "desc" }, include: { order: false } },
  productionBatchOrders: {
    where: { productionBatch: { deletedAt: null } },
    take: 1,
    include: { productionBatch: { select: { status: true, pickupLocation: true, pickupNotes: true, pickupDate: true, pickupTime: true } } }
  }
} satisfies Prisma.OrderInclude;
type OrderForApiInput = Order & {
  items?: OrderItem[];
  productionBatchOrders?: Array<{ productionBatch: Pick<ProductionBatch, "pickupLocation" | "pickupNotes" | "pickupDate" | "pickupTime"> }>;
  [key: string]: unknown;
};

export function orderForApi(order: OrderForApiInput) {
  const { subtotal, total, items, productionBatchOrders, ...rest } = order;
  const batch = productionBatchOrders?.[0]?.productionBatch;
  const pickupTime = batch?.pickupTime instanceof Date ? batch.pickupTime.toISOString().slice(11, 16) : null;
  return {
    ...rest,
    subtotal: Number(subtotal),
    total: Number(total),
    items: items?.map((item) => ({ ...item, unitPrice: Number(item.unitPrice), totalPrice: Number(item.totalPrice) })),
    pickup: {
      available: ["READY_FOR_PICKUP", "PICKED_UP"].includes(order.fulfillmentStatus),
      pickedUp: order.fulfillmentStatus === "PICKED_UP",
      location: batch?.pickupLocation ?? null,
      notes: batch?.pickupNotes ?? null,
      date: batch?.pickupDate instanceof Date ? batch.pickupDate.toISOString().slice(0, 10) : null,
      time: pickupTime
    }
  };
}
export function createPublicOrderId() { return createRandomToken(18); }
