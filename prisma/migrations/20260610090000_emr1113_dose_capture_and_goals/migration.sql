-- EMR-1113 (PJ-1) — post-dose data-capture persistence + treatment goals.
--
-- 1. DoseLog.sideEffects — the QuickDoseLogger's 12-item side-effect grid now
--    persists with each dose (JSON string array of side-effect ids from
--    src/lib/domain/emoji-outcomes.ts SIDE_EFFECT_OPTIONS).
-- 2. TreatmentGoal — patient-authored goals (baseline → target on a 1-10
--    scale). Standalone table with plain-string ids (no foreign keys), same
--    pattern as CannabisRecommendation in 20260609180000_emr1103.
--
-- Everything is additive + idempotent (IF NOT EXISTS) so it applies cleanly
-- over a db-push-drifted database where the column/table may already exist.

-- ── DoseLog: persist the side-effect quick-picks ─────────────────────────────
ALTER TABLE "DoseLog" ADD COLUMN IF NOT EXISTS "sideEffects" JSONB;

-- ── TreatmentGoal: patient-authored outcome goals ────────────────────────────
CREATE TABLE IF NOT EXISTS "TreatmentGoal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "baselineValue" INTEGER NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "targetDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentGoal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TreatmentGoal_patientId_idx" ON "TreatmentGoal"("patientId");
