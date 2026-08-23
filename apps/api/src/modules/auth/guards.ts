import type { User, UserRole } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../plugins/prisma.js";
import { hashToken } from "../../lib/crypto.js";
import { sessionCookieName } from "./cookies.js";

export type AuthenticatedUser = Pick<User, "id" | "name" | "email" | "avatarUrl" | "role" | "courseId" | "courseConfirmedAt">;

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: AuthenticatedUser;
  }
}

export function isAdminRole(role: UserRole) {
  return role === "ADMIN";
}

function unauthorized(reply: FastifyReply) {
  return reply.status(401).send({
    error: {
      code: "UNAUTHENTICATED",
      message: "Autenticacao obrigatoria."
    }
  });
}

export async function getAuthenticatedUser(request: FastifyRequest) {
  const sessionToken = request.cookies[sessionCookieName];

  if (!sessionToken) {
    return null;
  }

  const session = await prisma.session.findFirst({
    where: {
      tokenHash: hashToken(sessionToken),
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: {
      user: true
    }
  });

  if (!session || session.user.deletedAt) {
    return null;
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    avatarUrl: session.user.avatarUrl,
    role: session.user.role,
    courseId: session.user.courseId,
    courseConfirmedAt: session.user.courseConfirmedAt
  } satisfies AuthenticatedUser;
}

export async function requireAuthenticated(request: FastifyRequest, reply: FastifyReply) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return unauthorized(reply);
  }

  request.currentUser = user;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return unauthorized(reply);
  }

  if (!isAdminRole(user.role)) {
    return reply.status(403).send({
      error: {
        code: "FORBIDDEN",
        message: "Acesso administrativo obrigatorio."
      }
    });
  }

  request.currentUser = user;
}
