import { isAllowedInstitutionalEmail } from "@ca/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { config } from "../../config.js";
import { createRandomToken, hashToken, safeEqual } from "../../lib/crypto.js";
import { prisma } from "../../plugins/prisma.js";
import { getCookieOptions, oauthNonceCookieName, oauthStateCookieName, sessionCookieName } from "./cookies.js";
import type { GoogleAuthProvider } from "./google.js";
import { buildGoogleAuthorizationUrl } from "./oauth.js";
import { getAuthenticatedUser, requireAuthenticated } from "./guards.js";
import { auditRequestContext } from "../../lib/audit.js";

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(24)
});

const profileSchema = z.object({
  courseId: z.string().min(1)
});

const sessionDurationMs = 1000 * 60 * 60 * 24 * 14;

function publicUser(user: Awaited<ReturnType<typeof getAuthenticatedUser>>) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    courseId: user.courseId,
    courseConfirmedAt: user.courseConfirmedAt,
    needsProfileCompletion: !user.courseId
  };
}

export function authRoutes(authProvider: GoogleAuthProvider): FastifyPluginAsync {
  return async function registerAuthRoutes(app) {
    app.get("/auth/google", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (_request, reply) => {
      const state = createRandomToken();
      const nonce = createRandomToken();
      const cookieOptions = { ...getCookieOptions(config.NODE_ENV === "production"), maxAge: 60 * 10 };

      reply.setCookie(oauthStateCookieName, state, cookieOptions);
      reply.setCookie(oauthNonceCookieName, nonce, cookieOptions);
      return reply.redirect(buildGoogleAuthorizationUrl(state, nonce));
    });

    app.get("/auth/google/callback", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
      const query = callbackQuerySchema.parse(request.query);
      const expectedState = request.cookies[oauthStateCookieName];
      const expectedNonce = request.cookies[oauthNonceCookieName];

      reply.clearCookie(oauthStateCookieName, getCookieOptions(config.NODE_ENV === "production"));
      reply.clearCookie(oauthNonceCookieName, getCookieOptions(config.NODE_ENV === "production"));

      if (!expectedState || !safeEqual(query.state, expectedState) || !expectedNonce) {
        return reply.status(400).send({
          error: { code: "INVALID_OAUTH_STATE", message: "Fluxo de autenticacao invalido." }
        });
      }

      const identity = await authProvider.exchangeCodeForIdentity(query.code, expectedNonce);

      if (!isAllowedInstitutionalEmail(identity.email)) {
        return reply.status(403).send({
          error: { code: "INSTITUTIONAL_EMAIL_REQUIRED", message: "Use seu e-mail institucional da UNIJUI." }
        });
      }

      const userAvatarData = identity.avatarUrl ? { avatarUrl: identity.avatarUrl } : {};
      const user = await prisma.user.upsert({
        where: { googleSubject: identity.googleSubject },
        update: {
          name: identity.name,
          email: identity.email,
          ...userAvatarData,
          deletedAt: null
        },
        create: {
          googleSubject: identity.googleSubject,
          name: identity.name,
          email: identity.email,
          ...userAvatarData
        }
      });

      const sessionToken = createRandomToken(48);
      await prisma.$transaction(async (tx) => {
        await tx.session.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(sessionToken),
            expiresAt: new Date(Date.now() + sessionDurationMs)
          }
        });
        if (user.role === "ADMIN") {
          await tx.auditLog.create({ data: {
            actorUserId: user.id,
            action: "ADMIN_LOGIN",
            entityType: "User",
            entityId: user.id,
            ...auditRequestContext(request)
          } });
        }
      });

      reply.setCookie(sessionCookieName, sessionToken, {
        ...getCookieOptions(config.NODE_ENV === "production"),
        maxAge: sessionDurationMs / 1000
      });

      return reply.redirect(`${config.FRONTEND_URL}${user.courseId ? "/" : "/profile"}`);
    });

    app.get("/auth/me", async (request) => {
      return { user: publicUser(await getAuthenticatedUser(request)) };
    });

    app.get("/auth/status", async (request) => {
      const user = await getAuthenticatedUser(request);
      return { authenticated: Boolean(user), user: publicUser(user) };
    });

    app.post("/auth/logout", { preHandler: requireAuthenticated }, async (request, reply) => {
      const sessionToken = request.cookies[sessionCookieName];

      if (sessionToken) {
        await prisma.session.updateMany({
          where: { tokenHash: hashToken(sessionToken), revokedAt: null },
          data: { revokedAt: new Date() }
        });
      }

      reply.clearCookie(sessionCookieName, getCookieOptions(config.NODE_ENV === "production"));
      return { ok: true };
    });

    app.post("/profile/complete", { preHandler: requireAuthenticated }, async (request, reply) => {
      const user = request.currentUser;

      if (!user) {
        return reply.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Autenticacao obrigatoria." } });
      }

      if (user.courseConfirmedAt) {
        return reply.status(409).send({
          error: { code: "COURSE_ALREADY_CONFIRMED", message: "Seu curso somente pode ser alterado por um administrador." }
        });
      }

      const body = profileSchema.parse(request.body);
      const course = await prisma.course.findFirst({ where: { id: body.courseId } });

      if (!course) {
        return reply.status(404).send({ error: { code: "COURSE_NOT_FOUND", message: "Curso nao encontrado." } });
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { courseId: course.id, courseConfirmedAt: new Date() },
        include: { course: true }
      });

      return { user: publicUser(updatedUser), course: updatedUser.course };
    });
  };
}
