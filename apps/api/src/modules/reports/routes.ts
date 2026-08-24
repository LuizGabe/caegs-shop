import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../plugins/prisma.js";
import { requireAdmin } from "../auth/guards.js";
import { batchSummary } from "../production-batches/service.js";
import { createCsv } from "./csv.js";
import { dashboardData } from "./service.js";

const batchParams = z.object({ id: z.string().min(1) });

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
        user: { select: { name: true, email: true, course: { select: { name: true } } } },
        items: { orderBy: { createdAt: "asc" } },
        productionBatchOrders: { where: { productionBatch: { deletedAt: null } }, take: 1, include: { productionBatch: { select: { code: true } } } }
      },
      orderBy: { createdAt: "asc" }
    });
    const rows = orders.flatMap((order) => order.items.map((item) => [
      order.publicId,
      order.user.name,
      order.user.email,
      order.user.course?.name ?? "",
      item.productNameSnapshot,
      item.variantNameSnapshot,
      item.quantity,
      item.totalPrice.toFixed(2),
      order.paymentStatus,
      order.fulfillmentStatus,
      order.productionBatchOrders[0]?.productionBatch.code ?? "",
      order.createdAt.toISOString()
    ]));
    await prisma.auditLog.create({ data: { ...auditContext(request), action: "ORDERS_CSV_EXPORTED", entityType: "OrderReport" } });
    return sendCsv(reply, `pedidos-${new Date().toISOString().slice(0, 10)}.csv`, createCsv(["Pedido", "Referencia tecnica", "Nome", "Email", "Curso", "Produto", "Tamanho", "Quantidade", "Valor", "Status do pagamento", "Status logistico", "Lote", "Data"], rows));
  });
};


