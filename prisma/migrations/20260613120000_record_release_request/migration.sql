-- EMR-082 — patient-authorized medical record release persistence.
--
-- Replaces the sessionStorage-only scaffold (src/lib/portal/record-release-store)
-- with a real table so a patient's HIPAA authorization survives, is reviewable
-- by the care team, and is revocable. Standalone table with a plain-string
-- patientId (no foreign key), same pattern as TreatmentGoal (20260610090000)
-- and CannabisRecommendation (20260609180000), so it applies cleanly over a
-- db-push-drifted database.
--
-- Additive + idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "RecordReleaseRequest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "recipientName" TEXT NOT NULL,
    "recipientPractice" TEXT,
    "recipientEmail" TEXT,
    "recipientFax" TEXT,
    "recipientAddress" TEXT,
    "scope" TEXT NOT NULL,
    "categories" TEXT[],
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "patientSignatureName" TEXT NOT NULL,
    "patientSignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordReleaseRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RecordReleaseRequest_patientId_status_idx" ON "RecordReleaseRequest"("patientId", "status");
