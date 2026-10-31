-- Add an optional product mapping for plan-priced invoice lines.
-- Existing plans remain unmapped until an administrator explicitly assigns a product.
ALTER TABLE "Plan" ADD COLUMN "productId" TEXT REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Plan_productId_idx" ON "Plan"("productId");
