-- EMR-1103 (WS-D) — Physician Workflow Phase 1 schema additions, captured as a
-- migration artifact. These models/columns were introduced into schema.prisma
-- by the Phase 1 fixes (commits 0186db9, b33eb9d, d554500) and applied to dev
-- via `db push`; this migration records them for fresh databases and deploys.
--
-- Everything is additive + idempotent (IF NOT EXISTS / guarded constraints) so
-- it also applies cleanly over a db-push-drifted database where the tables and
-- columns may already exist.

-- ── B1: ClinicalOrder — persisted lab + imaging orders ──────────────────────
CREATE TABLE IF NOT EXISTS "ClinicalOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "orderType" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'routine',
    "diagnosisCodes" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'placed',
    "transmissionMode" TEXT NOT NULL DEFAULT 'simulated',
    "orderedById" TEXT NOT NULL,
    "orderedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClinicalOrder_patientId_orderType_idx" ON "ClinicalOrder"("patientId", "orderType");
CREATE INDEX IF NOT EXISTS "ClinicalOrder_organizationId_status_idx" ON "ClinicalOrder"("organizationId", "status");

DO $$ BEGIN
  ALTER TABLE "ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── M1: CannabisRecommendation — persisted AI treatment recommendations ─────
-- Standalone (plain-string ids, no @relation), so no foreign keys.
CREATE TABLE IF NOT EXISTS "CannabisRecommendation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "inputContext" JSONB NOT NULL,
    "recommendation" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CannabisRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CannabisRecommendation_patientId_idx" ON "CannabisRecommendation"("patientId");

-- ── M3: DosingRegimen pharmacy routing ──────────────────────────────────────
ALTER TABLE "DosingRegimen" ADD COLUMN IF NOT EXISTS "pharmacyId" TEXT;
ALTER TABLE "DosingRegimen" ADD COLUMN IF NOT EXISTS "pharmacyName" TEXT;

-- ── B4: CodingSuggestion physician approval fields ──────────────────────────
ALTER TABLE "CodingSuggestion" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'suggested';
ALTER TABLE "CodingSuggestion" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "CodingSuggestion" ADD COLUMN IF NOT EXISTS "approvedByName" TEXT;
ALTER TABLE "CodingSuggestion" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "CodingSuggestion" ADD COLUMN IF NOT EXISTS "approvedIcd10" JSONB;
ALTER TABLE "CodingSuggestion" ADD COLUMN IF NOT EXISTS "approvedEmLevel" TEXT;
