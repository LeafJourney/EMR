-- EMR-787 — Practice Manager Agent v1 (EMR-788 schema)
-- Clinical / office supplies. Distinct from the cannabis dispensary domain
-- (CannabisProduct / SupplyProduct). Domain helpers in
-- src/lib/domain/supplies.ts.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "SupplyOrderStatus" AS ENUM (
  'agent_drafted',
  'awaiting_approval',
  'approved',
  'submitted',
  'shipped',
  'delivered',
  'rejected',
  'cancelled'
);

CREATE TYPE "SupplyOrderProposedByKind" AS ENUM (
  'agent',
  'user'
);

CREATE TYPE "SupplyOrderActorKind" AS ENUM (
  'agent',
  'user',
  'system'
);

CREATE TYPE "SupplyOrderAuditAction" AS ENUM (
  'drafted',
  'approved',
  'rejected',
  'submitted',
  'shipped',
  'delivered',
  'edited',
  'cancelled',
  'auto_submitted',
  'reverted'
);

-- ---------------------------------------------------------------------------
-- Supplier
-- ---------------------------------------------------------------------------

CREATE TABLE "Supplier" (
  "id"                      TEXT NOT NULL,
  "organizationId"          TEXT NOT NULL,
  "name"                    TEXT NOT NULL,
  "contactName"             TEXT,
  "email"                   TEXT,
  "phone"                   TEXT,
  "defaultPaymentTermsDays" INTEGER NOT NULL DEFAULT 30,
  "notes"                   TEXT,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Supplier_organizationId_idx" ON "Supplier"("organizationId");

ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Supply
-- ---------------------------------------------------------------------------

CREATE TABLE "Supply" (
  "id"                TEXT NOT NULL,
  "organizationId"    TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "sku"               TEXT,
  "category"          TEXT,
  "supplierId"        TEXT,
  "reorderThreshold"  INTEGER NOT NULL DEFAULT 0,
  "reorderQty"        INTEGER NOT NULL DEFAULT 0,
  "lastUnitCostCents" INTEGER,
  "onHand"            INTEGER NOT NULL DEFAULT 0,
  "unit"              TEXT NOT NULL DEFAULT 'ea',
  "notes"             TEXT,
  "deletedAt"         TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Supply_organizationId_idx" ON "Supply"("organizationId");
CREATE INDEX "Supply_organizationId_deletedAt_idx"
  ON "Supply"("organizationId", "deletedAt");

ALTER TABLE "Supply"
  ADD CONSTRAINT "Supply_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Supply"
  ADD CONSTRAINT "Supply_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- SupplyOrder
-- ---------------------------------------------------------------------------

CREATE TABLE "SupplyOrder" (
  "id"                  TEXT NOT NULL,
  "organizationId"      TEXT NOT NULL,
  "supplyId"            TEXT NOT NULL,
  "supplierId"          TEXT NOT NULL,
  "status"              "SupplyOrderStatus" NOT NULL DEFAULT 'agent_drafted',
  "qty"                 INTEGER NOT NULL,
  "unitCostCents"       INTEGER NOT NULL,
  "totalCents"          INTEGER NOT NULL,
  "proposedByKind"      "SupplyOrderProposedByKind" NOT NULL,
  "proposedByAgentId"   TEXT,
  "proposedByUserId"    TEXT,
  "approvedByUserId"    TEXT,
  "autoSubmitted"       BOOLEAN NOT NULL DEFAULT false,
  "rejectionReason"     TEXT,
  "submittedAt"         TIMESTAMP(3),
  "shippedAt"           TIMESTAMP(3),
  "deliveredAt"         TIMESTAMP(3),
  "deliveredQty"        INTEGER,
  "expectedDeliveryAt"  TIMESTAMP(3),
  "supplierPoRef"       TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  "deletedAt"           TIMESTAMP(3),
  CONSTRAINT "SupplyOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplyOrder_organizationId_status_idx"
  ON "SupplyOrder"("organizationId", "status");
CREATE INDEX "SupplyOrder_supplyId_createdAt_idx"
  ON "SupplyOrder"("supplyId", "createdAt" DESC);
CREATE INDEX "SupplyOrder_organizationId_createdAt_idx"
  ON "SupplyOrder"("organizationId", "createdAt");

ALTER TABLE "SupplyOrder"
  ADD CONSTRAINT "SupplyOrder_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplyOrder"
  ADD CONSTRAINT "SupplyOrder_supplyId_fkey"
  FOREIGN KEY ("supplyId") REFERENCES "Supply"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplyOrder"
  ADD CONSTRAINT "SupplyOrder_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplyOrder"
  ADD CONSTRAINT "SupplyOrder_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplyOrder"
  ADD CONSTRAINT "SupplyOrder_proposedByUserId_fkey"
  FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- SupplyOrderAuditEntry — append-only per-order activity feed.
-- ---------------------------------------------------------------------------

CREATE TABLE "SupplyOrderAuditEntry" (
  "id"            TEXT NOT NULL,
  "orderId"       TEXT NOT NULL,
  "actorKind"     "SupplyOrderActorKind" NOT NULL,
  "actorAgentId"  TEXT,
  "actorUserId"   TEXT,
  "action"        "SupplyOrderAuditAction" NOT NULL,
  "payload"       JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplyOrderAuditEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplyOrderAuditEntry_orderId_createdAt_idx"
  ON "SupplyOrderAuditEntry"("orderId", "createdAt");

ALTER TABLE "SupplyOrderAuditEntry"
  ADD CONSTRAINT "SupplyOrderAuditEntry_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "SupplyOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplyOrderAuditEntry"
  ADD CONSTRAINT "SupplyOrderAuditEntry_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
