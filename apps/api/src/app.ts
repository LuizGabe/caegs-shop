import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { config } from "./config.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { createGoogleAuthProvider, type GoogleAuthProvider } from "./modules/auth/google.js";
import { authRoutes } from "./modules/auth/routes.js";
import { courseRoutes } from "./modules/users/routes.js";
import { prisma } from "./plugins/prisma.js";
import { productRoutes } from "./modules/products/routes.js";
import { orderRoutes } from "./modules/orders/routes.js";
import { createAsaasPaymentProvider } from "./modules/payments/asaas.js";
import type { PaymentProvider } from "./modules/payments/provider.js";
import { paymentRoutes } from "./modules/payments/routes.js";
import { asaasWebhookRoutes } from "./modules/webhooks/asaas-routes.js";
import { productionBatchRoutes } from "./modules/production-batches/routes.js";
import { reportRoutes } from "./modules/reports/routes.js";
import { createEmailService, type EmailService } from "./modules/email/service.js";
import { cancellationRoutes } from "./modules/payments/cancellation-routes.js";

export type BuildAppOptions = {
  authProvider?: GoogleAuthProvider;
  paymentProvider?: PaymentProvider;
  emailService?: EmailService;
};

function getStatusCode(error: unknown) {
  if (error instanceof ZodError) {
    return 400;
  }
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return 500;
  }

  const statusCode = error.statusCode;
  return typeof statusCode === "number" && statusCode >= 400 ? statusCode : 500;
}

function getErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Dados invalidos.";
  }
  if (error instanceof Error) {
    return error.message;
  }

  return "Requisicao invalida.";
}

function isUnsafeMethod(method: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

export function buildApp(options: BuildAppOptions = {}) {
  const emailService = options.emailService ?? createEmailService();
  const paymentProvider = options.paymentProvider ?? createAsaasPaymentProvider();
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.asaas-access-token",
        "req.body.cpfCnpj",
        "body.cpfCnpj",
        "GOOGLE_CLIENT_SECRET",
        "ASAAS_API_KEY",
        "ASAAS_WEBHOOK_TOKEN",
        "RESEND_API_KEY",
        "SESSION_SECRET"
      ],
      serializers: {
        req(request: FastifyRequest) {
          return {
            method: request.method,
            url: request.url.split("?", 1)[0] ?? request.url,
            host: request.hostname,
            remoteAddress: request.ip
          };
        }
      }
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
  app.register(adminRoutes(emailService));
  app.register(productRoutes);
  app.register(orderRoutes);
  app.register(paymentRoutes(paymentProvider));
  app.register(cancellationRoutes(paymentProvider, emailService));
  app.register(asaasWebhookRoutes(emailService));
  app.register(productionBatchRoutes(emailService));
  app.register(reportRoutes);

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
