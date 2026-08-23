import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../../plugins/prisma.js";
import { requireAdmin, requireAuthenticated } from "../auth/guards.js";
import { createOrderSchema, createPublicOrderId, orderForApi, orderInclude, statusUpdateSchema } from "./service.js";

const publicIdSchema = z.object({ publicId: z.string().min(10).max(100) });
const paginationSchema = z.object({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });
const saleWindow = () => ({ active: true, AND: [{ OR: [{ salesStartAt: { lte: new Date() } }, { salesStartAt: null }] }, { OR: [{ salesEndAt: { gte: new Date() } }, { salesEndAt: null }] }] });
function notFound(reply: any) { return reply.status(404).send({ error: { code: "ORDER_NOT_FOUND", message: "Pedido não encontrado." } }); }

export const orderRoutes: FastifyPluginAsync = async (app) => {
  app.post("/orders", { preHandler: requireAuthenticated }, async (request, reply) => {
    const input = createOrderSchema.parse(request.body); const user = request.currentUser!;
    const order = await prisma.$transaction(async (tx) => {
      const snapshots = await Promise.all(input.items.map(async (item) => {
        const product = await tx.product.findFirst({ where: { id: item.productId, ...saleWindow() } });
        const variant = await tx.productVariant.findFirst({ where: { id: item.productVariantId, productId: item.productId, active: true } });
        if (!product || !variant) throw Object.assign(new Error("Um produto ou variante não está disponível."), { statusCode: 400 });
        return { productId: product.id, productVariantId: variant.id, productNameSnapshot: product.name, variantNameSnapshot: variant.name, unitPrice: product.salePrice, quantity: item.quantity, totalPrice: product.salePrice.mul(item.quantity) };
      }));
      const total = snapshots.reduce((sum, item) => sum.add(item.totalPrice), new (await import("@prisma/client")).Prisma.Decimal(0));
      return tx.order.create({ data: { publicId: createPublicOrderId(), userId: user.id, subtotal: total, total, items: { create: snapshots }, statusHistory: { create: { newPaymentStatus: "PENDING", newFulfillmentStatus: "WAITING_PAYMENT", source: "SYSTEM", note: "Pedido criado." } } }, include: orderInclude });
    });
    return reply.status(201).send({ order: orderForApi(order) });
  });
  app.get("/orders", { preHandler: requireAuthenticated }, async (request) => { const user = request.currentUser!; const orders = await prisma.order.findMany({ where: { userId: user.id }, include: orderInclude, orderBy: { createdAt: "desc" } }); return { orders: orders.map(orderForApi) }; });
  app.get("/orders/:publicId", { preHandler: requireAuthenticated }, async (request, reply) => { const user = request.currentUser!; const publicId = publicIdSchema.parse(request.params).publicId; const order = await prisma.order.findFirst({ where: { publicId, userId: user.id }, include: orderInclude }); return order ? { order: orderForApi(order) } : notFound(reply); });

  app.get("/admin/orders", { preHandler: requireAdmin }, async (request) => { const { page, pageSize } = paginationSchema.parse(request.query); const [total, orders] = await prisma.$transaction([prisma.order.count(), prisma.order.findMany({ include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })]); return { orders: orders.map(orderForApi), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }; });
  app.get("/admin/orders/:publicId", { preHandler: requireAdmin }, async (request, reply) => { const order = await prisma.order.findUnique({ where: { publicId: publicIdSchema.parse(request.params).publicId }, include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } } }); return order ? { order: orderForApi(order) } : notFound(reply); });
  app.patch("/admin/orders/:publicId/status", { preHandler: requireAdmin }, async (request, reply) => { const publicId = publicIdSchema.parse(request.params).publicId; const input = statusUpdateSchema.parse(request.body); const order = await prisma.order.findUnique({ where: { publicId }, include: orderInclude }); if (!order) return notFound(reply); const updated = await prisma.$transaction(async (tx) => { const next = await tx.order.update({ where: { id: order.id }, data: { fulfillmentStatus: input.fulfillmentStatus }, include: orderInclude }); await tx.orderStatusHistory.create({ data: { orderId: order.id, previousPaymentStatus: order.paymentStatus, newPaymentStatus: order.paymentStatus, previousFulfillmentStatus: order.fulfillmentStatus, newFulfillmentStatus: input.fulfillmentStatus, changedByUserId: request.currentUser!.id, source: "ADMIN", note: input.note ?? null } }); return next; }); return { order: orderForApi(updated) }; });
};
