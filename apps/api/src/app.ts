import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { config } from "./config.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { createGoogleAuthProvider, type GoogleAuthProvider } from "./modules/auth/google.js";
import { authRoutes } from "./modules/auth/routes.js";
import { courseRoutes } from "./modules/users/routes.js";
import { prisma } from "./plugins/prisma.js";

export type BuildAppOptions = {
  authProvider?: GoogleAuthProvider;
};

function getStatusCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return 500;
  }

  const statusCode = error.statusCode;
  return typeof statusCode === "number" && statusCode >= 400 ? statusCode : 500;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Requisicao invalida.";
}

function isUnsafeMethod(method: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "GOOGLE_CLIENT_SECRET",
        "ASAAS_API_KEY",
        "ASAAS_WEBHOOK_TOKEN",
        "RESEND_API_KEY",
        "SESSION_SECRET"
      ]
    },
    trustProxy: config.TRUST_PROXY
  });

  app.register(cookie, { secret: config.SESSION_SECRET });
  app.register(helmet);
  app.register(cors, {
    origin: config.FRONTEND_URL,
    credentials: true
  });
  app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute"
  });

  app.addHook("preHandler", async (request, reply) => {
    if (!isUnsafeMethod(request.method)) {
      return;
    }

    const origin = request.headers.origin;

    if (origin && origin !== config.FRONTEND_URL) {
      return reply.status(403).send({
        error: {
          code: "INVALID_ORIGIN",
          message: "Origem da requisicao nao permitida."
        }
      });
    }
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/health/db", async (_request, reply) => {
    await prisma.$queryRaw`SELECT 1`;
    return reply.send({ status: "ok" });
  });

  app.register(authRoutes(options.authProvider ?? createGoogleAuthProvider()));
  app.register(courseRoutes);
  app.register(adminRoutes);

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = getStatusCode(error);

    if (statusCode >= 500) {
      app.log.error(error);
    }

    return reply.status(statusCode).send({
      error: {
        code: statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR",
        message: statusCode >= 500 ? "Ocorreu um erro inesperado." : getErrorMessage(error)
      }
    });
  });

  return app;
}
