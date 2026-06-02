-- EMR-917 — Tier-3 per-patient clinician override for the Clinical Assessment
-- Rules Engine. One override per (patient, assessment): require / skip /
-- not_applicable. Consumed by the pure engine in assessment-rules.ts.
CREATE TABLE IF NOT EXISTS "PatientAssessmentOverride" (
  "id"             TEXT NOT NULL,
  "patientId"      TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assessmentSlug" TEXT NOT NULL,
  "override"       TEXT NOT NULL,
  "reason"         TEXT,
  "setByUserId"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatientAssessmentOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PatientAssessmentOverride_patientId_assessmentSlug_key" ON "PatientAssessmentOverride"("patientId", "assessmentSlug");
CREATE INDEX IF NOT EXISTS "PatientAssessmentOverride_organizationId_idx" ON "PatientAssessmentOverride"("organizationId");
