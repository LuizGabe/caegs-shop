import { Prisma } from "@prisma/client";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { auditRequestContext } from "../../lib/audit.js";
import { prisma } from "../../plugins/prisma.js";
import { requireAdmin, requireAuthenticated } from "../auth/guards.js";
import { createHumanReadableOrderFields, createOrderSchema, createPublicOrderId, orderForApi, orderInclude, statusUpdateSchema } from "./service.js";

const publicIdSchema = z.object({ publicId: z.string().min(10).max(100) });
const paginationSchema = z.object({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });
const pickupSchema = z.object({ note: z.string().trim().max(500).optional() });
const saleWindow = () => ({
  active: true,
  AND: [
    { OR: [{ salesStartAt: { lte: new Date() } }, { salesStartAt: null }] },
    { OR: [{ salesEndAt: { gte: new Date() } }, { salesEndAt: null }] }
  ]
});

function notFound(reply: FastifyReply) {
  return reply.status(404).send({ error: { code: "ORDER_NOT_FOUND", message: "Pedido nao encontrado." } });
}

export const orderRoutes: FastifyPluginAsync = async (app) => {
  app.post("/orders", { preHandler: requireAuthenticated }, async (request, reply) => {
    const input = createOrderSchema.parse(request.body);
    const user = request.currentUser!;
    if (!user.courseId || !user.courseConfirmedAt) {
      return reply.status(403).send({ error: { code: "COURSE_REQUIRED", message: "Conclua seu cadastro antes de criar um pedido." } });
    }
    if (!await prisma.course.findFirst({ where: { id: user.courseId, canPurchase: true } })) {
      return reply.status(403).send({ error: { code: "COURSE_CANNOT_PURCHASE", message: "Seu curso nao esta habilitado para compras." } });
    }
    const order = await prisma.$transaction(async (tx) => {
      const snapshots = await Promise.all(input.items.map(async (item) => {
        const product = await tx.product.findFirst({ where: { id: item.productId, ...saleWindow(), deletedAt: null } });
        const variant = await tx.productVariant.findFirst({ where: { id: item.productVariantId, productId: item.productId, active: true, deletedAt: null } });
        if (!product || !variant) throw Object.assign(new Error("Um produto ou variante nao esta disponivel."), { statusCode: 400 });
        return { productId: product.id, productVariantId: variant.id, productNameSnapshot: product.name, variantNameSnapshot: variant.name, unitPrice: product.salePrice, quantity: item.quantity, totalPrice: product.salePrice.mul(item.quantity) };
      }));
      const total = snapshots.reduce((sum, item) => sum.add(item.totalPrice), new Prisma.Decimal(0));
      const orderIdentity = await createHumanReadableOrderFields(tx);
      return tx.order.create({
        data: { publicId: createPublicOrderId(), ...orderIdentity, userId: user.id, subtotal: total, total, items: { create: snapshots }, statusHistory: { create: { newPaymentStatus: "PENDING", newFulfillmentStatus: "WAITING_PAYMENT", source: "SYSTEM", note: "Pedido criado." } } },
        include: orderInclude
      });
    });
    return reply.status(201).send({ order: orderForApi(order) });
  });

  app.get("/orders", { preHandler: requireAuthenticated }, async (request) => {
    const orders = await prisma.order.findMany({ where: { userId: request.currentUser!.id }, include: orderInclude, orderBy: { createdAt: "desc" } });
    return { orders: orders.map(orderForApi) };
  });
  app.get("/orders/:publicId", { preHandler: requireAuthenticated }, async (request, reply) => {
    const publicId = publicIdSchema.parse(request.params).publicId;
    const order = await prisma.order.findFirst({ where: { publicId, userId: request.currentUser!.id }, include: orderInclude });
    return order ? { order: orderForApi(order) } : notFound(reply);
  });

  app.get("/admin/orders", { preHandler: requireAdmin }, async (request) => {
    const { page, pageSize } = paginationSchema.parse(request.query);
    const [total, orders] = await prisma.$transaction([
      prisma.order.count(),
      prisma.order.findMany({ include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })
    ]);
    return { orders: orders.map(orderForApi), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  });
  app.get("/admin/orders/:publicId", { preHandler: requireAdmin }, async (request, reply) => {
    const order = await prisma.order.findUnique({ where: { publicId: publicIdSchema.parse(request.params).publicId }, include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } } });
    return order ? { order: orderForApi(order) } : notFound(reply);
  });
  app.patch("/admin/orders/:publicId/status", { preHandler: requireAdmin }, async (request, reply) => {
    const publicId = publicIdSchema.parse(request.params).publicId;
    const input = statusUpdateSchema.parse(request.body);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ORDER_STATUS:${publicId}`}))`;
      const order = await tx.order.findUnique({ where: { publicId }, include: orderInclude });
      if (!order) return null;
      if (order.fulfillmentStatus === input.fulfillmentStatus) return order;
      if (input.fulfillmentStatus !== "WAITING_PAYMENT" && order.paymentStatus !== "CONFIRMED") {
        throw Object.assign(new Error("Somente pedidos pagos podem avancar no fluxo logistico."), { statusCode: 409 });
      }
      const next = await tx.order.update({ where: { id: order.id }, data: { fulfillmentStatus: input.fulfillmentStatus }, include: orderInclude });
      await tx.orderStatusHistory.create({ data: { orderId: order.id, previousPaymentStatus: order.paymentStatus, newPaymentStatus: order.paymentStatus, previousFulfillmentStatus: order.fulfillmentStatus, newFulfillmentStatus: input.fulfillmentStatus, changedByUserId: request.currentUser!.id, source: "ADMIN", note: input.note ?? null } });
      await tx.auditLog.create({ data: { actorUserId: request.currentUser!.id, action: "ORDER_STATUS_UPDATED", entityType: "Order", entityId: order.id, metadata: { previousStatus: order.fulfillmentStatus, newStatus: input.fulfillmentStatus }, ...auditRequestContext(request) } });
      return next;
    });
    return updated ? { order: orderForApi(updated) } : notFound(reply);
  });
  app.post("/admin/orders/:publicId/pickup", { preHandler: requireAdmin }, async (request, reply) => {
    const publicId = publicIdSchema.parse(request.params).publicId;
    const input = pickupSchema.parse(request.body ?? {});
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ORDER_PICKUP:${publicId}`}))`;
      const order = await tx.order.findUnique({ where: { publicId }, include: orderInclude });
      if (!order) return null;
      if (order.fulfillmentStatus === "PICKED_UP") return order;
      if (order.paymentStatus !== "CONFIRMED" || order.fulfillmentStatus !== "READY_FOR_PICKUP") {
        throw Object.assign(new Error("Somente pedidos pagos e disponiveis podem ser marcados como retirados."), { statusCode: 409 });
      }
      const next = await tx.order.update({ where: { id: order.id }, data: { fulfillmentStatus: "PICKED_UP" }, include: orderInclude });
      await tx.orderStatusHistory.create({ data: {
        orderId: order.id,
        previousPaymentStatus: order.paymentStatus,
        newPaymentStatus: order.paymentStatus,
        previousFulfillmentStatus: order.fulfillmentStatus,
        newFulfillmentStatus: "PICKED_UP",
        changedByUserId: request.currentUser!.id,
        source: "ADMIN",
        note: input.note ?? "Pedido retirado presencialmente."
      } });
      await tx.auditLog.create({ data: { actorUserId: request.currentUser!.id, action: "ORDER_PICKED_UP", entityType: "Order", entityId: order.id, metadata: { previousStatus: order.fulfillmentStatus, newStatus: "PICKED_UP" }, ...auditRequestContext(request) } });
      return next;
    });
    return updated ? { order: orderForApi(updated) } : notFound(reply);
  });
};



