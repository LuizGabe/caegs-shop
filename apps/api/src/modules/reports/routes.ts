import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../plugins/prisma.js";
import { requireAdmin } from "../auth/guards.js";
import { batchSummary } from "../production-batches/service.js";
import { createCsv } from "./csv.js";
import { dashboardData } from "./service.js";

const batchParams = z.object({ id: z.string().min(1) });
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data invalida.").refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}, "Data invalida.");
const personalDataExportQuerySchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
  confirmPersonalDataExport: z.coerce.boolean().refine((value) => value, "Confirme a exportacao de dados pessoais."),
  reason: z.string().trim().min(3).max(200)
}).superRefine((value, context) => {
  if (new Date(`${value.to}T00:00:00.000Z`) < new Date(`${value.from}T00:00:00.000Z`)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Data final deve ser igual ou posterior a inicial." });
  }
});

function sendCsv(reply: FastifyReply, filename: string, content: string) {
  return reply
    .header("content-type", "text/csv; charset=utf-8")
    .header("content-disposition", `attachment; filename="${filename}"`)
    .header("cache-control", "no-store")
    .send(content);
}

function auditContext(request: FastifyRequest) {
  return { actorUserId: request.currentUser!.id, ipAddress: request.ip, userAgent: request.headers["user-agent"]?.slice(0, 500) ?? null };
}

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/dashboard", { preHandler: requireAdmin }, async () => dashboardData());

  app.get("/admin/reports/production-batches/:id.csv", { preHandler: requireAdmin }, async (request, reply) => {
    const id = batchParams.parse(request.params).id;
    const batch = await prisma.productionBatch.findFirst({
      where: { id },
      select: {
        id: true,
        code: true,
        orders: { select: { order: { select: { items: { select: { productId: true, productVariantId: true, productNameSnapshot: true, variantNameSnapshot: true, quantity: true } } } } } }
      }
    });
    if (!batch) return reply.status(404).send({ error: { code: "BATCH_NOT_FOUND", message: "Lote nao encontrado." } });
    const rows = batchSummary(batch.orders).flatMap((product) => product.variants.map((variant) => [product.productName, variant.variantName, variant.quantity]));
    await prisma.auditLog.create({ data: { ...auditContext(request), action: "PRODUCTION_CSV_EXPORTED", entityType: "ProductionBatch", entityId: batch.id } });
    return sendCsv(reply, `producao-${batch.code.replace(/[^A-Za-z0-9_-]/g, "-")}.csv`, createCsv(["Produto", "Tamanho", "Quantidade"], rows));
  });

  app.get("/admin/reports/orders.csv", { preHandler: requireAdmin }, async (request, reply) => {
    const orders = await prisma.order.findMany({
      include: {
        items: { orderBy: { createdAt: "asc" } },
        productionBatchOrders: { where: { productionBatch: { deletedAt: null } }, take: 1, include: { productionBatch: { select: { code: true } } } }
      },
      orderBy: { createdAt: "asc" }
    });
    const rows = orders.flatMap((order) => order.items.map((item) => [
      order.humanReadableId,
      item.productNameSnapshot,
      item.variantNameSnapshot,
      item.quantity,
      order.fulfillmentStatus,
      order.productionBatchOrders[0]?.productionBatch.code ?? "",
      order.createdAt.toISOString(),
      item.totalPrice.toFixed(2)
    ]));
    await prisma.auditLog.create({ data: { ...auditContext(request), action: "ORDERS_CSV_EXPORTED", entityType: "OrderReport" } });
    return sendCsv(reply, `pedidos-operacional-${new Date().toISOString().slice(0, 10)}.csv`, createCsv(["Pedido", "Produto", "Tamanho", "Quantidade", "Status", "Lote", "Data", "Valor"], rows));
  });

  app.get("/admin/reports/buyers.csv", { preHandler: requireAdmin }, async (request, reply) => {
    const query = personalDataExportQuerySchema.parse(request.query);
    const from = new Date(`${query.from}T00:00:00.000Z`);
    const toExclusive = new Date(`${query.to}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: from, lt: toExclusive } },
      include: {
        user: { select: { name: true, email: true, course: { select: { name: true } } } },
        items: { orderBy: { createdAt: "asc" } }
      },
      orderBy: { createdAt: "asc" }
    });
    const rows = orders.flatMap((order) => order.items.map((item) => [
      order.user.name,
      order.user.email,
      order.courseNameSnapshot ?? order.user.course?.name ?? "",
      order.humanReadableId,
      item.productNameSnapshot,
      item.quantity,
      order.fulfillmentStatus,
      order.createdAt.toISOString()
    ]));
    await prisma.auditLog.create({ data: {
      ...auditContext(request),
      action: "PERSONAL_DATA_EXPORT",
      entityType: "OrderReport",
      metadata: { from: query.from, to: query.to, reason: query.reason, rowCount: rows.length }
    } });
    return sendCsv(reply, `compradores-${query.from}-${query.to}.csv`, createCsv(["Nome", "Email", "Curso", "Pedido", "Produto", "Quantidade", "Status", "Data"], rows));
  });
};


