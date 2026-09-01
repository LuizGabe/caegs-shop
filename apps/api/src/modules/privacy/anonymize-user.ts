import { createRandomToken } from "../../lib/crypto.js";
import { prisma } from "../../plugins/prisma.js";

export type AnonymizeUserInput = {
  userId: string;
  actorUserId?: string | null;
  reason: string;
};

export async function anonymizeUser(input: AnonymizeUserInput) {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 200) {
    throw Object.assign(new Error("Motivo deve ter entre 3 e 200 caracteres."), { statusCode: 400 });
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw Object.assign(new Error("Usuario nao encontrado."), { statusCode: 404 });
    }
    if (user.anonymizedAt) {
      return { user, anonymized: false, alreadyAnonymized: true };
    }

    const now = new Date();
    await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now }
    });

    const anonymized = await tx.user.update({
      where: { id: user.id },
      data: {
        googleSubject: null,
        name: "Usuario removido",
        email: `deleted+${createRandomToken(24)}@privacy.invalid`,
        avatarUrl: null,
        courseId: null,
        courseConfirmedAt: null,
        anonymizedAt: now,
        deletedAt: user.deletedAt ?? now
      }
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        action: "USER_ANONYMIZED",
        entityType: "User",
        entityId: user.id,
        metadata: { reason }
      }
    });

    return { user: anonymized, anonymized: true, alreadyAnonymized: false };
  });
}
