ALTER TABLE "Order"
  ADD COLUMN "humanReadableId" TEXT,
  ADD COLUMN "orderNumber" INTEGER,
  ADD COLUMN "orderYear" INTEGER;

WITH numbered AS (
  SELECT
    id,
    EXTRACT(YEAR FROM "createdAt")::INTEGER AS order_year,
    ROW_NUMBER() OVER (
      PARTITION BY EXTRACT(YEAR FROM "createdAt")::INTEGER
      ORDER BY "createdAt" ASC, id ASC
    ) AS order_number
  FROM "Order"
)
UPDATE "Order" AS o
SET
  "orderYear" = numbered.order_year,
  "orderNumber" = numbered.order_number,
  "humanReadableId" = LPAD(numbered.order_number::TEXT, 4, '0') || '.' || numbered.order_year::TEXT
FROM numbered
WHERE o.id = numbered.id;

ALTER TABLE "Order"
  ALTER COLUMN "humanReadableId" SET NOT NULL,
  ALTER COLUMN "orderNumber" SET NOT NULL,
  ALTER COLUMN "orderYear" SET NOT NULL;

CREATE UNIQUE INDEX "Order_humanReadableId_key" ON "Order"("humanReadableId");
CREATE UNIQUE INDEX "Order_orderYear_orderNumber_key" ON "Order"("orderYear", "orderNumber");
CREATE INDEX "Order_orderYear_orderNumber_idx" ON "Order"("orderYear", "orderNumber");
