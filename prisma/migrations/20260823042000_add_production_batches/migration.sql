ALTER TYPE "ProductionBatchStatus" RENAME TO "ProductionBatchStatus_old";

CREATE TYPE "ProductionBatchStatus" AS ENUM (
  'DRAFT',
  'SENT_TO_PRODUCTION',
  'RECEIVED',
  'READY_FOR_PICKUP',
  'CLOSED'
);

ALTER TABLE "ProductionBatch"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "ProductionBatch"
ALTER COLUMN "status" TYPE "ProductionBatchStatus"
USING (
  CASE "status"::text
    WHEN 'SENT_TO_SUPPLIER' THEN 'SENT_TO_PRODUCTION'
    WHEN 'IN_PRODUCTION' THEN 'SENT_TO_PRODUCTION'
    WHEN 'CANCELLED' THEN 'CLOSED'
    ELSE "status"::text
  END
)::"ProductionBatchStatus";

ALTER TABLE "ProductionBatch"
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "ProductionBatchStatus_old";

ALTER TABLE "ProductionBatch"
RENAME COLUMN "supplierNotes" TO "notes";

ALTER TABLE "ProductionBatch"
ADD COLUMN "name" TEXT,
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "closedAt" TIMESTAMP(3);

UPDATE "ProductionBatch"
SET "name" = "code"
WHERE "name" IS NULL;

UPDATE "ProductionBatch"
SET "createdByUserId" = (
  SELECT "id" FROM "User" WHERE "role" = 'ADMIN' AND "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 1
)
WHERE "createdByUserId" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ProductionBatch" WHERE "createdByUserId" IS NULL) THEN
    RAISE EXCEPTION 'An admin user is required to migrate existing production batches';
  END IF;
END $$;

ALTER TABLE "ProductionBatch"
ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "createdByUserId" SET NOT NULL;

CREATE UNIQUE INDEX "ProductionBatchOrder_orderId_key" ON "ProductionBatchOrder"("orderId");
CREATE INDEX "ProductionBatch_status_deletedAt_createdAt_idx" ON "ProductionBatch"("status", "deletedAt", "createdAt");
CREATE INDEX "ProductionBatch_createdByUserId_idx" ON "ProductionBatch"("createdByUserId");

ALTER TABLE "ProductionBatch"
ADD CONSTRAINT "ProductionBatch_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
