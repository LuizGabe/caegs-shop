import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../../plugins/prisma.js";
import { requireAdmin } from "../auth/guards.js";
import { auditRequestContext } from "../../lib/audit.js";
import { orderForApi, orderInclude } from "../orders/service.js";
import type { EmailService } from "../email/service.js";

const updateUserCourseParamsSchema = z.object({
  userId: z.string().min(1)
});

const updateUserCourseBodySchema = z.object({
  courseId: z.string().min(1)
});
const emailSettingsSchema = z.object({ enabled: z.boolean() });
const orderPublicIdParamsSchema = z.object({ publicId: z.string().min(10).max(100) });

async function emailsEnabled() {
  const setting = await prisma.appSetting.findUnique({ where: { key: "emailsEnabled" } });
  return setting?.value === true;
}

export function adminRoutes(emailService: EmailService): FastifyPluginAsync {
  return async (app) => {
  app.get("/admin/auth-check", { preHandler: requireAdmin }, async (request) => ({
    ok: true,
    user: request.currentUser
  }));

  app.get("/admin/settings/emails", { preHandler: requireAdmin }, async () => {
    return { enabled: await emailsEnabled() };
  });

  app.patch("/admin/settings/emails", { preHandler: requireAdmin }, async (request) => {
    const { enabled } = emailSettingsSchema.parse(request.body);
    await prisma.$transaction(async (tx) => {
      const current = await tx.appSetting.findUnique({ where: { key: "emailsEnabled" } });
      await tx.appSetting.upsert({ where: { key: "emailsEnabled" }, update: { value: enabled }, create: { key: "emailsEnabled", value: enabled } });
      await tx.auditLog.create({ data: {
        actorUserId: request.currentUser!.id,
        action: "EMAIL_SETTINGS_UPDATED",
        entityType: "AppSetting",
        entityId: "emailsEnabled",
        metadata: { previousEnabled: current?.value === true, enabled },
        ...auditRequestContext(request)
      } });
    });
    return { enabled };
  });

  app.get("/admin/orders/pending-payment", { preHandler: requireAdmin }, async () => {
    const orders = await prisma.order.findMany({
      where: { paymentStatus: "PENDING" },
      include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" }
    });

    return { orders: orders.map(orderForApi) };
  });

  app.post("/admin/orders/:publicId/payment-reminder", { preHandler: requireAdmin }, async (request, reply) => {
    if (!(await emailsEnabled())) {
      return reply.status(409).send({ error: { code: "EMAILS_DISABLED", message: "Ative o envio de emails antes de enviar avisos." } });
    }

    const { publicId } = orderPublicIdParamsSchema.parse(request.params);
    const order = await prisma.order.findUnique({
      where: { publicId },
      include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } }
    });

    if (!order) {
      return reply.status(404).send({ error: { code: "ORDER_NOT_FOUND", message: "Pedido nao encontrado." } });
    }
    if (order.paymentStatus !== "PENDING") {
      return reply.status(409).send({ error: { code: "ORDER_NOT_PENDING", message: "Somente pedidos aguardando pagamento podem receber este aviso." } });
    }

    const payment = order.payments[0];
    await emailService.notify({
      type: "PAYMENT_PENDING_REMINDER",
      deduplicationKey: `PAYMENT_PENDING_REMINDER:${order.id}`,
      userId: order.userId,
      orderId: order.id,
      to: order.user.email,
      name: order.user.name,
      orderPublicId: order.publicId,
      orderHumanReadableId: order.humanReadableId,
      pixExpiresAt: payment?.pixExpiresAt ?? null
    });
    await prisma.auditLog.create({ data: {
      actorUserId: request.currentUser!.id,
      action: "PAYMENT_PENDING_REMINDER_SENT",
      entityType: "Order",
      entityId: order.id,
      metadata: { orderPublicId: order.publicId },
      ...auditRequestContext(request)
    } });

    return { ok: true };
  });

  app.post("/admin/orders/:publicId/payment-reminder/test", { preHandler: requireAdmin }, async (request, reply) => {
    if (!(await emailsEnabled())) {
      return reply.status(409).send({ error: { code: "EMAILS_DISABLED", message: "Ative o envio de emails antes de enviar testes." } });
    }

    const { publicId } = orderPublicIdParamsSchema.parse(request.params);
    const order = await prisma.order.findUnique({
      where: { publicId },
      include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } }
    });

    if (!order) {
      return reply.status(404).send({ error: { code: "ORDER_NOT_FOUND", message: "Pedido nao encontrado." } });
    }
    if (order.paymentStatus !== "PENDING") {
      return reply.status(409).send({ error: { code: "ORDER_NOT_PENDING", message: "Somente pedidos aguardando pagamento podem receber este aviso." } });
    }

    const admin = request.currentUser!;
    const payment = order.payments[0];
    await emailService.notify({
      type: "PAYMENT_PENDING_REMINDER",
      deduplicationKey: `PAYMENT_PENDING_REMINDER_TEST:${order.id}:${admin.id}:${Date.now()}`,
      userId: admin.id,
      orderId: order.id,
      to: admin.email,
      name: admin.name,
      orderPublicId: order.publicId,
      orderHumanReadableId: order.humanReadableId,
      pixExpiresAt: payment?.pixExpiresAt ?? null
    });
    await prisma.auditLog.create({ data: {
      actorUserId: admin.id,
      action: "PAYMENT_PENDING_REMINDER_TEST_SENT",
      entityType: "Order",
      entityId: order.id,
      metadata: { orderPublicId: order.publicId },
      ...auditRequestContext(request)
    } });

    return { ok: true, to: admin.email };
  });


  app.get("/admin/users", { preHandler: requireAdmin }, async () => {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        role: true,
        createdAt: true,
        course: {
          select: {
            id: true,
            name: true,
            slug: true,
            canPurchase: true
          }
        }
      }
    });

    return { users };
  });

  app.get("/admin/users/:userId", { preHandler: requireAdmin }, async (request, reply) => {
    const params = updateUserCourseParamsSchema.parse(request.params);
    const user = await prisma.user.findFirst({
      where: { id: params.userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        courseId: true,
        courseConfirmedAt: true,
        createdAt: true,
        course: {
          select: {
            id: true,
            name: true,
            slug: true,
            canPurchase: true
          }
        }
      }
    });

    if (!user) {
      return reply.status(404).send({ error: { code: "USER_NOT_FOUND", message: "Usuario nao encontrado." } });
    }

    return { user };
  });

  app.get("/admin/users/:userId/orders", { preHandler: requireAdmin }, async (request, reply) => {
    const params = updateUserCourseParamsSchema.parse(request.params);
    const user = await prisma.user.findFirst({
      where: { id: params.userId, deletedAt: null },
      select: { id: true }
    });

    if (!user) {
      return reply.status(404).send({ error: { code: "USER_NOT_FOUND", message: "Usuario nao encontrado." } });
    }

    const orders = await prisma.order.findMany({
      where: { userId: params.userId },
      include: orderInclude,
      orderBy: { createdAt: "desc" }
    });

    return { orders: orders.map(orderForApi) };
  });

  app.patch("/admin/users/:userId/course", { preHandler: requireAdmin }, async (request, reply) => {
    const actorUser = request.currentUser;

    if (!actorUser) {
      return reply.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Autenticacao obrigatoria." } });
    }

    const params = updateUserCourseParamsSchema.parse(request.params);
    const body = updateUserCourseBodySchema.parse(request.body);

    const course = await prisma.course.findFirst({ where: { id: body.courseId } });

    if (!course) {
      return reply.status(404).send({ error: { code: "COURSE_NOT_FOUND", message: "Curso nao encontrado." } });
    }

    const user = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: params.userId } });
      if (!current) throw Object.assign(new Error("Usuario nao encontrado."), { statusCode: 404 });
      const updated = await tx.user.update({
        where: { id: params.userId },
        data: { courseId: course.id, courseConfirmedAt: new Date() },
        select: {
          id: true,
          name: true,
          role: true,
          createdAt: true,
          course: {
            select: {
              id: true,
              name: true,
              slug: true,
              canPurchase: true
            }
          }
        }
      });
      await tx.auditLog.create({ data: {
        actorUserId: actorUser.id,
        action: "USER_COURSE_UPDATED",
        entityType: "User",
        entityId: updated.id,
        metadata: { previousCourseId: current.courseId, courseId: course.id },
        ...auditRequestContext(request)
      } });
      return updated;
    });

    return { user };
  });
};
}
