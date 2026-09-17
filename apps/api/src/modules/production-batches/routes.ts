import { Prisma, type OrderFulfillmentStatus } from "@prisma/client";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../plugins/prisma.js";
import { requireAdmin } from "../auth/guards.js";
import { batchForApi, batchInclude, createBatchCode, nextBatchStatus, orderStatusForBatch } from "./service.js";
import type { EmailService } from "../email/service.js";
import type { EmailNotificationType } from "../email/templates.js";

const idParams = z.object({ id: z.string().min(1) });
const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  notes: z.string().trim().max(5000).nullable().optional(),
  pickupLocation: z.string().trim().max(500).nullable().optional(),
  pickupNotes: z.string().trim().max(2000).nullable().optional()
});
const updateSchema = createSchema.partial().refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo.");
const associationSchema = z.object({ orderIds: z.array(z.string().min(1)).max(500).transform((ids) => [...new Set(ids)]) });
const transitionSchema = z.object({ status: z.enum(["SENT_TO_PRODUCTION", "RECEIVED", "READY_FOR_PICKUP", "CLOSED"]) });
const pickupDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data invalida.").refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}, "Data invalida.");
const pickupTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horario invalido.");
const pickupAvailabilitySchema = z.object({
  location: z.string().trim().min(2).max(500),
  notes: z.string().trim().max(2000).nullable().optional(),
  date: pickupDateSchema.nullable().optional(),
  time: pickupTimeSchema.nullable().optional()
});
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(100).optional()
});

function notFound(reply: FastifyReply) {
  return reply.status(404).send({ error: { code: "BATCH_NOT_FOUND", message: "Lote nao encontrado." } });
}

function conflict(message: string) {
  return Object.assign(new Error(message), { statusCode: 409 });
}

function auditContext(request: FastifyRequest) {
  return {
    actorUserId: request.currentUser!.id,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"]?.slice(0, 500) ?? null
  };
}

export function productionBatchRoutes(emailService: EmailService): FastifyPluginAsync {
  return async (app) => {
  app.get("/admin/production-batches", { preHandler: requireAdmin }, async () => {
    const batches = await prisma.productionBatch.findMany({
      include: { createdBy: { select: { id: true, name: true } }, _count: { select: { orders: true } } },
      orderBy: { createdAt: "desc" }
    });
    return { batches };
  });

  app.post("/admin/production-batches", { preHandler: requireAdmin }, async (request, reply) => {
    const input = createSchema.parse(request.body);
    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.productionBatch.create({
        data: {
          code: createBatchCode(),
          name: input.name,
          createdByUserId: request.currentUser!.id,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.pickupLocation !== undefined ? { pickupLocation: input.pickupLocation } : {}),
          ...(input.pickupNotes !== undefined ? { pickupNotes: input.pickupNotes } : {})
        },
        include: batchInclude
      });
      await tx.auditLog.create({
        data: { ...auditContext(request), action: "PRODUCTION_BATCH_CREATED", entityType: "ProductionBatch", entityId: created.id, metadata: { status: created.status } }
      });
      return created;
    });
    return reply.status(201).send({ batch: batchForApi(batch) });
  });

  app.get("/admin/production-batches/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const id = idParams.parse(request.params).id;
    const [batch, auditLogs] = await Promise.all([
      prisma.productionBatch.findFirst({ where: { id }, include: batchInclude }),
      prisma.auditLog.findMany({ where: { entityType: "ProductionBatch", entityId: id }, orderBy: { createdAt: "desc" } })
    ]);
    return batch ? { batch: batchForApi(batch, auditLogs) } : notFound(reply);
  });

  app.patch("/admin/production-batches/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const id = idParams.parse(request.params).id;
    const input = updateSchema.parse(request.body);
    const current = await prisma.productionBatch.findFirst({ where: { id } });
    if (!current) return notFound(reply);
    if (current.status !== "DRAFT") throw conflict("Somente lotes em rascunho podem ser editados.");
    const batch = await prisma.productionBatch.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.pickupLocation !== undefined ? { pickupLocation: input.pickupLocation } : {}),
        ...(input.pickupNotes !== undefined ? { pickupNotes: input.pickupNotes } : {})
      },
      include: batchInclude
    });
    return { batch: batchForApi(batch) };
  });

  app.get("/admin/production-batches/:id/eligible-orders", { preHandler: requireAdmin }, async (request, reply) => {
    const id = idParams.parse(request.params).id;
    const { page, pageSize, search } = paginationSchema.parse(request.query);
    const batch = await prisma.productionBatch.findFirst({ where: { id } });
    if (!batch) return notFound(reply);
    const where: Prisma.OrderWhereInput = {
      paymentStatus: "CONFIRMED",
      fulfillmentStatus: { in: ["PAID", "WAITING_PRODUCTION"] },
      OR: [
        { productionBatchOrders: { none: {} } },
        { productionBatchOrders: { some: { productionBatchId: id } } }
      ],
      ...(search ? {
        AND: [{ OR: [
          { publicId: { contains: search, mode: "insensitive" } },
          { humanReadableId: { contains: search, mode: "insensitive" } },
          { user: { name: { contains: search, mode: "insensitive" } } },
          { user: { email: { contains: search, mode: "insensitive" } } }
        ] }]
      } : {})
    };
    const [total, orders] = await prisma.$transaction([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
          items: { orderBy: { createdAt: "asc" } },
          productionBatchOrders: { where: { productionBatchId: id }, select: { productionBatchId: true } }
        },
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);
    return {
      orders: orders.map((order) => ({
        id: order.id,
        publicId: order.publicId,
        user: order.user,
        total: Number(order.total),
        createdAt: order.createdAt,
        associated: order.productionBatchOrders.length > 0,
        items: order.items.map((item) => ({ productName: item.productNameSnapshot, variantName: item.variantNameSnapshot, quantity: item.quantity }))
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };
  });

  app.put("/admin/production-batches/:id/orders", { preHandler: requireAdmin }, async (request, reply) => {
    const id = idParams.parse(request.params).id;
    const { orderIds } = associationSchema.parse(request.body);
    try {
      const batch = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`BATCH:${id}`}))`;
        const current = await tx.productionBatch.findFirst({ where: { id, deletedAt: null }, include: { orders: true } });
        if (!current) throw Object.assign(new Error("Lote nao encontrado."), { statusCode: 404 });
        if (current.status !== "DRAFT") throw conflict("Pedidos so podem ser alterados em lotes em rascunho.");
        const orders = orderIds.length ? await tx.order.findMany({
          where: { id: { in: orderIds } },
          include: { productionBatchOrders: true }
        }) : [];
        if (orders.length !== orderIds.length) throw Object.assign(new Error("Um ou mais pedidos nao foram encontrados."), { statusCode: 400 });
        for (const order of orders) {
          if (order.paymentStatus !== "CONFIRMED" || !["PAID", "WAITING_PRODUCTION"].includes(order.fulfillmentStatus)) {
            throw Object.assign(new Error("Somente pedidos pagos e elegiveis podem entrar no lote."), { statusCode: 400 });
          }
          if (order.productionBatchOrders.some((association) => association.productionBatchId !== id)) {
            throw conflict("Um ou mais pedidos ja pertencem a outro lote.");
          }
        }

        const existingIds = current.orders.map((association) => association.orderId);
        const addedIds = orderIds.filter((orderId) => !existingIds.includes(orderId));
        if (addedIds.length) await tx.productionBatchOrder.createMany({ data: addedIds.map((orderId) => ({ productionBatchId: id, orderId })) });
        await updateOrderStatuses(tx, addedIds, "WAITING_PRODUCTION", request.currentUser!.id, `Adicionado ao lote ${current.code}.`);
        await tx.auditLog.create({
          data: { ...auditContext(request), action: "PRODUCTION_BATCH_ORDERS_ADDED", entityType: "ProductionBatch", entityId: id, metadata: { addedOrderIds: addedIds } }
        });
        return tx.productionBatch.findUniqueOrThrow({ where: { id }, include: batchInclude });
      });
      return { batch: batchForApi(batch) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict("Um ou mais pedidos ja pertencem a outro lote.");
      throw error;
    }
  });

  app.put("/admin/production-batches/:id/pickup", { preHandler: requireAdmin }, async (request, reply) => {
    const id = idParams.parse(request.params).id;
    const input = pickupAvailabilitySchema.parse(request.body);
    const batch = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`BATCH:${id}`}))`;
      const current = await tx.productionBatch.findFirst({ where: { id, deletedAt: null }, include: { orders: true } });
      if (!current) throw Object.assign(new Error("Lote nao encontrado."), { statusCode: 404 });
      if (!["RECEIVED", "READY_FOR_PICKUP"].includes(current.status)) {
        throw conflict("O lote precisa estar recebido para disponibilizar a retirada.");
      }
      const publishing = current.status === "RECEIVED";
      if (publishing) {
        await updateOrderStatuses(tx, current.orders.map((association) => association.orderId), "READY_FOR_PICKUP", request.currentUser!.id, `Lote ${current.code} disponivel para retirada.`);
      }
      const updated = await tx.productionBatch.update({
        where: { id },
        data: {
          status: "READY_FOR_PICKUP",
          pickupLocation: input.location,
          pickupNotes: input.notes ?? null,
          pickupDate: input.date ? new Date(`${input.date}T00:00:00.000Z`) : null,
          pickupTime: input.time ? new Date(`1970-01-01T${input.time}:00.000Z`) : null
        },
        include: batchInclude
      });
      await tx.auditLog.create({ data: {
        ...auditContext(request),
        action: publishing ? "PRODUCTION_BATCH_PICKUP_PUBLISHED" : "PRODUCTION_BATCH_PICKUP_UPDATED",
        entityType: "ProductionBatch",
        entityId: id,
        metadata: { previousStatus: current.status, newStatus: "READY_FOR_PICKUP", location: input.location, date: input.date ?? null, time: input.time ?? null }
      } });
      return updated;
    });
    await notifyBatchOrders(emailService, "ORDER_READY_FOR_PICKUP", batch);
    return { batch: batchForApi(batch) };
  });

  app.post("/admin/production-batches/:id/transition", { preHandler: requireAdmin }, async (request, reply) => {
    const id = idParams.parse(request.params).id;
    const { status } = transitionSchema.parse(request.body);
    const batch = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`BATCH:${id}`}))`;
      const current = await tx.productionBatch.findFirst({ where: { id, deletedAt: null }, include: { orders: true } });
      if (!current) throw Object.assign(new Error("Lote nao encontrado."), { statusCode: 404 });
      if (status === "READY_FOR_PICKUP") throw conflict("Informe os dados de retirada para disponibilizar o lote.");
      if (nextBatchStatus[current.status] !== status) throw conflict(`Transicao invalida de ${current.status} para ${status}.`);
      if (current.status === "DRAFT" && current.orders.length === 0) throw conflict("Adicione ao menos um pedido antes de enviar para producao.");
      if (status === "CLOSED") {
        const pendingPickups = await tx.order.count({ where: { id: { in: current.orders.map((association) => association.orderId) }, fulfillmentStatus: { not: "PICKED_UP" } } });
        if (pendingPickups > 0) throw conflict("Todos os pedidos precisam ser retirados antes de fechar o lote.");
      }
      const targetOrderStatus = orderStatusForBatch[status];
      if (targetOrderStatus) await updateOrderStatuses(tx, current.orders.map((association) => association.orderId), targetOrderStatus, request.currentUser!.id, `Lote ${current.code}: ${status}.`);
      const updated = await tx.productionBatch.update({
        where: { id },
        data: { status, closedAt: status === "CLOSED" ? new Date() : null },
        include: batchInclude
      });
      await tx.auditLog.create({
        data: { ...auditContext(request), action: "PRODUCTION_BATCH_STATUS_CHANGED", entityType: "ProductionBatch", entityId: id, metadata: { previousStatus: current.status, newStatus: status } }
      });
      return updated;
    });
    if (status === "SENT_TO_PRODUCTION") await notifyBatchOrders(emailService, "ORDER_SENT_TO_PRODUCTION", batch);
    return { batch: batchForApi(batch) };
  });
  };
}

async function notifyBatchOrders(emailService: EmailService, type: EmailNotificationType, batch: {
  pickupLocation: string | null;
  pickupNotes: string | null;
  pickupDate: Date | null;
  pickupTime: Date | null;
  orders: Array<{ order: { id: string; publicId: string; humanReadableId: string; user: { id: string; name: string; email: string } } }>;
}) {
  for (const [index, { order }] of batch.orders.entries()) {
    await emailService.notify({
      type,
      deduplicationKey: `${type}:${order.id}`,
      userId: order.user.id,
      orderId: order.id,
      to: order.user.email,
      name: order.user.name,
      orderPublicId: order.publicId,
      orderHumanReadableId: order.humanReadableId,
      pickupLocation: batch.pickupLocation,
      pickupNotes: batch.pickupNotes,
      pickupDate: batch.pickupDate?.toISOString().slice(0, 10) ?? null,
      pickupTime: batch.pickupTime?.toISOString().slice(11, 16) ?? null
    });
    if (index < batch.orders.length - 1) await wait(150);
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function updateOrderStatuses(tx: Pick<typeof prisma, "order" | "orderStatusHistory">, orderIds: string[], status: OrderFulfillmentStatus, actorUserId: string, note: string) {
  if (!orderIds.length) return;
  const orders = await tx.order.findMany({ where: { id: { in: orderIds } } });
  for (const order of orders) {
    if (order.fulfillmentStatus === status) continue;
    await tx.order.update({ where: { id: order.id }, data: { fulfillmentStatus: status } });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        previousPaymentStatus: order.paymentStatus,
        newPaymentStatus: order.paymentStatus,
        previousFulfillmentStatus: order.fulfillmentStatus,
        newFulfillmentStatus: status,
        changedByUserId: actorUserId,
        source: "ADMIN",
        note
      }
    });
  }
}

