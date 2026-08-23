ALTER TABLE "EmailEvent" ADD COLUMN "deduplicationKey" TEXT;

CREATE UNIQUE INDEX "EmailEvent_deduplicationKey_key" ON "EmailEvent"("deduplicationKey");
CREATE INDEX "EmailEvent_type_createdAt_idx" ON "EmailEvent"("type", "createdAt");
