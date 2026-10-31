-- CreateTable
CREATE TABLE "DiscountRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
    "productId" TEXT,
    "value" REAL NOT NULL,
    "minimumAmount" REAL,
    "minimumQuantity" INTEGER,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiscountRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscountApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "discountRuleId" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscountApplication_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiscountApplication_discountRuleId_fkey" FOREIGN KEY ("discountRuleId") REFERENCES "DiscountRule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "productId" TEXT,
    "rate" REAL NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "subtotal" REAL NOT NULL,
    "taxRate" REAL NOT NULL DEFAULT 0,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL,
    "amountPaid" REAL NOT NULL DEFAULT 0,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("amountPaid", "createdAt", "dueDate", "id", "invoiceNumber", "issueDate", "periodEnd", "periodStart", "status", "subscriptionId", "subtotal", "taxAmount", "taxRate", "total", "updatedAt") SELECT "amountPaid", "createdAt", "dueDate", "id", "invoiceNumber", "issueDate", "periodEnd", "periodStart", "status", "subscriptionId", "subtotal", "taxAmount", "taxRate", "total", "updatedAt" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");
CREATE INDEX "Invoice_subscriptionId_idx" ON "Invoice"("subscriptionId");
CREATE UNIQUE INDEX "Invoice_subscriptionId_periodStart_key" ON "Invoice"("subscriptionId", "periodStart");
CREATE TABLE "new_InvoiceLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "productId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" REAL NOT NULL,
    "lineTotal" REAL NOT NULL,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL DEFAULT 0,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InvoiceLine" ("description", "id", "invoiceId", "lineTotal", "quantity", "unitPrice") SELECT "description", "id", "invoiceId", "lineTotal", "quantity", "unitPrice" FROM "InvoiceLine";
DROP TABLE "InvoiceLine";
ALTER TABLE "new_InvoiceLine" RENAME TO "InvoiceLine";
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRule_name_key" ON "DiscountRule"("name");

-- CreateIndex
CREATE INDEX "DiscountRule_active_validFrom_validUntil_idx" ON "DiscountRule"("active", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "DiscountRule_productId_active_idx" ON "DiscountRule"("productId", "active");

-- CreateIndex
CREATE INDEX "DiscountApplication_discountRuleId_createdAt_idx" ON "DiscountApplication"("discountRuleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountApplication_invoiceId_discountRuleId_key" ON "DiscountApplication"("invoiceId", "discountRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRule_name_key" ON "TaxRule"("name");

-- CreateIndex
CREATE INDEX "TaxRule_active_scope_priority_idx" ON "TaxRule"("active", "scope", "priority");

-- CreateIndex
CREATE INDEX "TaxRule_productId_active_idx" ON "TaxRule"("productId", "active");

-- Map legacy invoice states into the enhanced invoice lifecycle.
UPDATE "Invoice" SET "status" = 'CONFIRMED' WHERE "status" = 'OPEN';
UPDATE "Invoice" SET "status" = 'CANCELLED' WHERE "status" = 'VOID';

-- Backfill line tax details for existing invoices without changing their stored invoice totals.
UPDATE "InvoiceLine" SET "taxRate" = (SELECT "taxRate" FROM "Invoice" WHERE "Invoice"."id" = "InvoiceLine"."invoiceId"), "taxAmount" = ROUND("lineTotal" * (SELECT "taxRate" FROM "Invoice" WHERE "Invoice"."id" = "InvoiceLine"."invoiceId") / 100.0);
