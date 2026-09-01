import { config } from "../../config.js";

export const privacyRetention = {
  sessionsDays: config.PRIVACY_SESSION_RETENTION_DAYS,
  emailEventsDays: config.PRIVACY_EMAIL_EVENT_RETENTION_DAYS,
  emailErrorDays: config.PRIVACY_EMAIL_ERROR_RETENTION_DAYS,
  webhookPayloadDays: config.PRIVACY_WEBHOOK_RETENTION_DAYS,
  auditTechnicalMetadataDays: config.PRIVACY_AUDIT_TECH_RETENTION_DAYS,
  auditLogDays: config.PRIVACY_AUDIT_LOG_RETENTION_DAYS,
  pixPayloadDays: config.PRIVACY_PIX_DATA_RETENTION_DAYS
} as const;

export function daysAgo(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
