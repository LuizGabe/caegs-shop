import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../plugins/prisma.js";
import { requireAuthenticated } from "../auth/guards.js";

export const courseRoutes: FastifyPluginAsync = async (app) => {
  app.get("/courses", { preHandler: requireAuthenticated }, async () => {
    const courses = await prisma.course.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        canPurchase: true
      }
    });

    return { courses };
  });
};
