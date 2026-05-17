-- EMR-750 — Verification ledger for the nightly ControllerAuditLog JSONL
-- export to object storage.
--
-- One row per UTC day covered. coveredDate is unique so re-runs upsert
-- the row idempotently; the cron route compares row/byte counts and sha256
-- across re-runs against the same key to detect drift.
--
-- This is a system-owned ledger written from the cron handler. Unlike
-- ControllerAuditLog itself, this table is NOT append-only — the cron
-- handler upserts the row when an export is re-run for the same day.

CREATE TABLE "ControllerAuditExport" (
  "id"          TEXT PRIMARY KEY,
  "coveredDate" TIMESTAMP(3) NOT NULL,
  "storageKey"  TEXT NOT NULL,
  "rowCount"    INTEGER NOT NULL,
  "byteCount"   INTEGER NOT NULL,
  "sha256"      TEXT NOT NULL,
  "runAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ControllerAuditExport_coveredDate_key"
  ON "ControllerAuditExport" ("coveredDate");

CREATE INDEX "ControllerAuditExport_runAt_idx"
  ON "ControllerAuditExport" ("runAt");
