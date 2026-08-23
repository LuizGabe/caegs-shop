import type { FastifyPluginAsync } from "fastify";
import { config } from "../../config.js";
import { safeEqual } from "../../lib/crypto.js";
import { asaasWebhookSchema, receiveAsaasWebhook } from "./asaas-service.js";
import type { EmailService } from "../email/service.js";

export function asaasWebhookRoutes(emailService: EmailService): FastifyPluginAsync {
  return async (app) => {
  app.post("/webhooks/asaas", async (request, reply) => {
    const receivedToken = request.headers["asaas-access-token"];
    if (!config.ASAAS_WEBHOOK_TOKEN || typeof receivedToken !== "string" || !safeEqual(receivedToken, config.ASAAS_WEBHOOK_TOKEN)) {
      return reply.status(401).send({
        error: { code: "INVALID_WEBHOOK_TOKEN", message: "Webhook nao autorizado." }
      });
    }

    const event = asaasWebhookSchema.parse(request.body);
    const result = await receiveAsaasWebhook(event, emailService);
    return reply.status(200).send({ received: true, duplicate: result.duplicate });
  });
  };
}
