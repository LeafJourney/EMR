-- EMR-054 — wearable / health-app device connection persistence.
--
-- Backs the patient portal Integrations page (Connect / Disconnect / last
-- sync) with a real table instead of client-only React state. Garmin
-- connect/sync additionally drives a real ingestion pass into OutcomeLog
-- via GarminVitalsClient.
--
-- Standalone table with a plain-string patientId (no foreign key), same
-- pattern as RecordReleaseRequest (20260613120000) and TreatmentGoal
-- (20260610090000), so it applies cleanly over a db-push-drifted database.
--
-- Additive + idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "DeviceConnection" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "accessToken" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceConnection_patientId_provider_key" ON "DeviceConnection"("patientId", "provider");

CREATE INDEX IF NOT EXISTS "DeviceConnection_patientId_idx" ON "DeviceConnection"("patientId");
