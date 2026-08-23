import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const developmentSessionSecret = "development-session-secret-change-before-production";
const unsafeProductionSecrets = new Set([developmentSessionSecret, "replace-with-a-long-random-secret"]);
const envBoolean = z.preprocess((value) => value === "true" ? true : value === "false" ? false : value, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  BACKEND_HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(3333),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  BACKEND_URL: z.string().url().default("http://localhost:3333"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().min(3).default("Centro Academico <noreply@example.com>"),
  SESSION_SECRET: z.string().min(32).default(developmentSessionSecret),
  MAX_QUANTITY_PER_ITEM: z.coerce.number().int().positive().default(20),
  MAX_TOTAL_ITEMS_PER_ORDER: z.coerce.number().int().positive().default(50),
  TRUST_PROXY: envBoolean.default(false)
}).superRefine((env, context) => {
  if (env.NODE_ENV === "production" && unsafeProductionSecrets.has(env.SESSION_SECRET)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["SESSION_SECRET"], message: "SESSION_SECRET deve ser configurado em producao." });
  }
});

export const config = envSchema.parse(process.env);
