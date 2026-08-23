import type { FastifyRequest } from "fastify";

export function auditRequestContext(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"]?.slice(0, 500) ?? null
  };
}
