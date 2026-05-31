-- EMR-915 — staged pre-visit submissions from a kiosk→phone lobby session.
-- A lobby session never overwrites the chart; intake/consent completed on the
-- patient's phone land here as a pending review-queue row for staff/clinician.
CREATE TABLE IF NOT EXISTS "KioskLobbySubmission" (
  "id"               TEXT NOT NULL,
  "patientId"        TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "kind"             TEXT NOT NULL,
  "payload"          JSONB NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "reviewedByUserId" TEXT,
  "reviewedAt"       TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KioskLobbySubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KioskLobbySubmission_organizationId_status_idx" ON "KioskLobbySubmission"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "KioskLobbySubmission_patientId_kind_idx" ON "KioskLobbySubmission"("patientId", "kind");
