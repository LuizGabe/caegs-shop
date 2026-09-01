ALTER TABLE "User"
ADD COLUMN "anonymizedAt" TIMESTAMP(3);

ALTER TABLE "User"
ALTER COLUMN "googleSubject" DROP NOT NULL;

ALTER TABLE "Order"
ADD COLUMN "courseNameSnapshot" TEXT;

UPDATE "Order"
SET "courseNameSnapshot" = "Course"."name"
FROM "User"
LEFT JOIN "Course" ON "Course"."id" = "User"."courseId"
WHERE "Order"."userId" = "User"."id"
  AND "Order"."courseNameSnapshot" IS NULL
  AND "Course"."name" IS NOT NULL;

CREATE OR REPLACE FUNCTION "prevent_audit_log_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW."id" = OLD."id"
    AND NEW."actorUserId" IS NOT DISTINCT FROM OLD."actorUserId"
    AND NEW."action" IS NOT DISTINCT FROM OLD."action"
    AND NEW."entityType" IS NOT DISTINCT FROM OLD."entityType"
    AND NEW."entityId" IS NOT DISTINCT FROM OLD."entityId"
    AND NEW."metadata" IS NOT DISTINCT FROM OLD."metadata"
    AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt"
    AND NEW."ipAddress" IS NULL
    AND NEW."userAgent" IS NULL
    AND (OLD."ipAddress" IS NOT NULL OR OLD."userAgent" IS NOT NULL)
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'AuditLog is append-only' USING ERRCODE = '55000';
END;
$$;
