-- EMR-734 — Anomaly detector framework.
--
-- Adds the `Anomaly` table + `AnomalySeverity` enum. The framework lives in
-- src/lib/anomaly/framework.ts; the sweep cron lives in
-- src/app/api/cron/anomaly-sweep/route.ts. Concrete detectors land in
-- EMR-737 / EMR-740 / EMR-741.
--
-- Design notes:
--   - (kind, idempotencyKey) is unique so upserts are idempotent within a
--     detector. Two detectors that happen to generate the same idempotency
--     string don't collide.
--   - resolvedAt = null means "still live"; the cron flips it to now() when
--     the detector stops emitting (auto-resolve), or when `expiresAt < now`
--     (ttl-expiry). Rows are NEVER deleted — the table is the audit trail.

CREATE TYPE "AnomalySeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

CREATE TABLE "Anomaly" (
  "id"             TEXT PRIMARY KEY,
  "slug"           TEXT NOT NULL,
  "kind"           TEXT NOT NULL,
  "severity"       "AnomalySeverity" NOT NULL,
  "practiceId"     TEXT,
  "message"        TEXT NOT NULL,
  "deeplinkUrl"    TEXT NOT NULL,
  "context"        JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "ttlSeconds"     INTEGER NOT NULL,
  "firstSeenAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "resolvedAt"     TIMESTAMP(3)
);

CREATE UNIQUE INDEX "Anomaly_slug_key" ON "Anomaly" ("slug");

CREATE UNIQUE INDEX "Anomaly_kind_idempotencyKey_key"
  ON "Anomaly" ("kind", "idempotencyKey");

-- HQ feed: active rows by severity, newest first.
CREATE INDEX "Anomaly_resolvedAt_severity_lastSeenAt_idx"
  ON "Anomaly" ("resolvedAt", "severity", "lastSeenAt" DESC);

-- Per-practice drill-in.
CREATE INDEX "Anomaly_practiceId_resolvedAt_idx"
  ON "Anomaly" ("practiceId", "resolvedAt");

-- Per-detector triage and auto-resolve sweep.
CREATE INDEX "Anomaly_kind_resolvedAt_idx"
  ON "Anomaly" ("kind", "resolvedAt");
