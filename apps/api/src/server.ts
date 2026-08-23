import { buildApp } from "./app.js";
import { config } from "./config.js";
import { disconnectPrisma } from "./plugins/prisma.js";

const app = buildApp();

async function shutdown(signal: NodeJS.Signals) {
  app.log.info({ signal }, "Shutting down API");
  await app.close();
  await disconnectPrisma();
}

process.on("SIGINT", () => {
  shutdown("SIGINT").finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").finally(() => process.exit(0));
});

await app.listen({ host: config.BACKEND_HOST, port: config.PORT });
