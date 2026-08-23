import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../../plugins/prisma.js";
import { requireAdmin } from "../auth/guards.js";

const updateUserCourseParamsSchema = z.object({
  userId: z.string().min(1)
});

const updateUserCourseBodySchema = z.object({
  courseId: z.string().min(1)
});

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/auth-check", { preHandler: requireAdmin }, async (request) => ({
    ok: true,
    user: request.currentUser
  }));

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

    const user = await prisma.user.update({
      where: { id: params.userId },
      data: { courseId: course.id, courseConfirmedAt: new Date() },
      include: { course: true }
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: actorUser.id,
        action: "USER_COURSE_UPDATED",
        entityType: "User",
        entityId: user.id,
        metadata: { courseId: course.id }
      }
    });

    return { user };
  });
};
