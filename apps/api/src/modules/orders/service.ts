import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { createRandomToken } from "../../lib/crypto.js";

export const orderItemInputSchema = z.object({ productId: z.string().min(1), productVariantId: z.string().min(1), quantity: z.coerce.number().int().positive().max(20) });
export const createOrderSchema = z.object({ items: z.array(orderItemInputSchema).min(1).max(50) }).superRefine((data, ctx) => { const seen = new Set<string>(); data.items.forEach((item, index) => { const key = `${item.productId}:${item.productVariantId}`; if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items", index], message: "Produto e variante duplicados." }); seen.add(key); }); });
export const statusUpdateSchema = z.object({ paymentStatus: z.enum(["PENDING", "CONFIRMED", "FAILED", "REFUNDED", "CANCELLED"]).optional(), fulfillmentStatus: z.enum(["WAITING_PAYMENT", "PAID", "WAITING_PRODUCTION", "IN_PRODUCTION", "RECEIVED_FROM_SUPPLIER", "READY_FOR_PICKUP", "PICKED_UP", "CANCELLED"]).optional(), note: z.string().trim().max(500).optional() }).refine((data) => data.paymentStatus !== undefined || data.fulfillmentStatus !== undefined, "Informe ao menos um status.");
export const orderInclude = { items: { orderBy: { createdAt: "asc" } }, statusHistory: { orderBy: { createdAt: "desc" }, include: { order: false } } } satisfies Prisma.OrderInclude;
export function orderForApi(order: any) { const { subtotal, total, items, ...rest } = order; return { ...rest, subtotal: Number(subtotal), total: Number(total), items: items?.map((item: any) => ({ ...item, unitPrice: Number(item.unitPrice), totalPrice: Number(item.totalPrice) })) }; }
export function createPublicOrderId() { return createRandomToken(18); }