import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Order, OrderItem, ProductImage, ProductionBatch } from "@prisma/client";
import { createRandomToken } from "../../lib/crypto.js";
import { config } from "../../config.js";
import { prisma } from "../../plugins/prisma.js";

export const orderItemInputSchema = z.object({ productId: z.string().min(1), productVariantId: z.string().min(1), quantity: z.coerce.number().int().positive().max(config.MAX_QUANTITY_PER_ITEM) });
export const createOrderSchema = z.object({ items: z.array(orderItemInputSchema).min(1).max(config.MAX_TOTAL_ITEMS_PER_ORDER) }).superRefine((data, ctx) => { const seen = new Set<string>(); data.items.forEach((item, index) => { const key = `${item.productId}:${item.productVariantId}`; if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items", index], message: "Produto e variante duplicados." }); seen.add(key); }); });
export const statusUpdateSchema = z.object({ fulfillmentStatus: z.enum(["WAITING_PAYMENT", "PAID", "WAITING_PRODUCTION", "IN_PRODUCTION", "RECEIVED_FROM_SUPPLIER", "READY_FOR_PICKUP"]), note: z.string().trim().max(500).optional() });
export const orderInclude = {
  items: {
    orderBy: { createdAt: "asc" },
    include: {
      product: {
        select: {
          images: {
            where: { deletedAt: null, type: "PRODUCT" },
            orderBy: { displayOrder: "asc" },
            take: 1,
            select: { url: true, altText: true }
          }
        }
      }
    }
  },
  statusHistory: { orderBy: { createdAt: "desc" }, include: { order: false } },
  productionBatchOrders: {
    where: { productionBatch: { deletedAt: null } },
    take: 1,
    include: { productionBatch: { select: { status: true, pickupLocation: true, pickupNotes: true, pickupDate: true, pickupTime: true } } }
  }
} satisfies Prisma.OrderInclude;
type OrderItemForApi = OrderItem & { product?: { images?: Array<Pick<ProductImage, "url" | "altText">> } };

type OrderForApiInput = Order & {
  items?: OrderItemForApi[];
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
    items: items?.map((item) => {
      const thumbnail = item.product?.images?.[0] ?? null;
      const { product, ...restItem } = item;
      return {
        ...restItem,
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        thumbnailUrl: thumbnail?.url ?? null,
        thumbnailAltText: thumbnail?.altText ?? item.productNameSnapshot
      };
    }),
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
export function createPublicOrderId() {
  return createRandomToken(18);
}

type PrismaTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function createHumanReadableOrderFields(tx: PrismaTransaction, date = new Date()) {
  const orderYear = date.getFullYear();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ORDER_NUMBER:${orderYear}`}))`;
  const latest = await tx.order.findFirst({
    where: { orderYear },
    select: { orderNumber: true },
    orderBy: { orderNumber: "desc" }
  });
  const orderNumber = (latest?.orderNumber ?? 0) + 1;
  return {
    orderYear,
    orderNumber,
    humanReadableId: `${orderNumber.toString().padStart(4, "0")}.${orderYear}`
  };
}




