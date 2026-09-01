import { Prisma, type PaymentStatus } from "@prisma/client";
import { prisma } from "../../plugins/prisma.js";
import { daysAgo, privacyRetention } from "./policy.js";

export type PrivacyCleanupReport = {
  dryRun: boolean;
  sessionsToDelete: number;
  auditLogsToMinimize: number;
  webhookPayloadsToMinimize: number;
  emailErrorsToMinimize: number;
  emailEventsToMinimize: number;
  pixPayloadsToMinimize: number;
};

export type PrivacyCleanupOptions = {
  dryRun?: boolean;
  now?: Date;
};

const terminalPaymentStatuses: PaymentStatus[] = ["CONFIRMED", "REFUNDED", "CANCELLED", "FAILED"];

export async function cleanupPrivacyData(options: PrivacyCleanupOptions = {}): Promise<PrivacyCleanupReport> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const sessionCutoff = daysAgo(privacyRetention.sessionsDays, now);
  const auditTechCutoff = daysAgo(privacyRetention.auditTechnicalMetadataDays, now);
  const webhookCutoff = daysAgo(privacyRetention.webhookPayloadDays, now);
  const emailErrorCutoff = daysAgo(privacyRetention.emailErrorDays, now);
  const emailEventCutoff = daysAgo(privacyRetention.emailEventsDays, now);
  const pixCutoff = daysAgo(privacyRetention.pixPayloadDays, now);

  const sessionWhere: Prisma.SessionWhereInput = {
    OR: [
      { expiresAt: { lt: sessionCutoff } },
      { revokedAt: { lt: sessionCutoff } }
    ]
  };
  const auditWhere: Prisma.AuditLogWhereInput = {
    createdAt: { lt: auditTechCutoff },
    OR: [{ ipAddress: { not: null } }, { userAgent: { not: null } }]
  };
  const webhookWhere: Prisma.WebhookEventWhereInput = {
    receivedAt: { lt: webhookCutoff },
    OR: [{ payload: { not: Prisma.DbNull } }, { errorMessage: { not: null } }]
  };
  const emailErrorWhere: Prisma.EmailEventWhereInput = {
    createdAt: { lt: emailErrorCutoff },
    errorMessage: { not: null }
  };
  const emailEventWhere: Prisma.EmailEventWhereInput = {
    createdAt: { lt: emailEventCutoff },
    OR: [
      { userId: { not: null } },
      { orderId: { not: null } },
      { providerId: { not: null } },
      { errorMessage: { not: null } }
    ]
  };
  const pixWhere: Prisma.PaymentWhereInput = {
    status: { in: terminalPaymentStatuses },
    OR: [
      { pixQrCodeImage: { not: null } },
      { pixCopyPasteCode: { not: null } }
    ],
    AND: [{
      OR: [
        { confirmedAt: { lt: pixCutoff } },
        { refundedAt: { lt: pixCutoff } },
        { updatedAt: { lt: pixCutoff } }
      ]
    }]
  };

  const [
    sessionsToDelete,
    auditLogsToMinimize,
    webhookPayloadsToMinimize,
    emailErrorsToMinimize,
    emailEventsToMinimize,
    pixPayloadsToMinimize
  ] = await Promise.all([
    prisma.session.count({ where: sessionWhere }),
    prisma.auditLog.count({ where: auditWhere }),
    prisma.webhookEvent.count({ where: webhookWhere }),
    prisma.emailEvent.count({ where: emailErrorWhere }),
    prisma.emailEvent.count({ where: emailEventWhere }),
    prisma.payment.count({ where: pixWhere })
  ]);

  const report = {
    dryRun,
    sessionsToDelete,
    auditLogsToMinimize,
    webhookPayloadsToMinimize,
    emailErrorsToMinimize,
    emailEventsToMinimize,
    pixPayloadsToMinimize
  };

  if (dryRun) {
    return report;
  }

  await prisma.$transaction([
    prisma.session.deleteMany({ where: sessionWhere }),
    prisma.auditLog.updateMany({ where: auditWhere, data: { ipAddress: null, userAgent: null } }),
    prisma.webhookEvent.updateMany({ where: webhookWhere, data: { payload: Prisma.DbNull, errorMessage: null } }),
    prisma.emailEvent.updateMany({ where: emailErrorWhere, data: { errorMessage: null } }),
    prisma.emailEvent.updateMany({ where: emailEventWhere, data: { userId: null, orderId: null, providerId: null, errorMessage: null } }),
    prisma.payment.updateMany({ where: pixWhere, data: { pixQrCodeImage: null, pixCopyPasteCode: null } })
  ]);

  return report;
}

export function formatPrivacyCleanupReport(report: PrivacyCleanupReport) {
  return [
    `Dry run: ${report.dryRun ? "yes" : "no"}`,
    `Sessions to delete: ${report.sessionsToDelete}`,
    `AuditLogs to minimize: ${report.auditLogsToMinimize}`,
    `Webhook payloads to minimize: ${report.webhookPayloadsToMinimize}`,
    `Email errors to minimize: ${report.emailErrorsToMinimize}`,
    `Email events to minimize: ${report.emailEventsToMinimize}`,
    `PIX payloads to minimize: ${report.pixPayloadsToMinimize}`
  ].join("\n");
}

function cliErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Privacy cleanup failed.";
  if (message.includes("Can't reach database server")) return "Privacy cleanup failed: database is unavailable.";
  return `Privacy cleanup failed: ${message.split(/\r?\n/, 1)[0] ?? "unknown error"}`;
}

if (process.argv[1]?.endsWith("cleanup.ts") || process.argv[1]?.endsWith("cleanup.js")) {
  const dryRun = process.argv.includes("--dry-run");
  cleanupPrivacyData({ dryRun })
    .then((report) => {
      console.log(formatPrivacyCleanupReport(report));
    })
    .catch((error) => {
      console.error(cliErrorMessage(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
