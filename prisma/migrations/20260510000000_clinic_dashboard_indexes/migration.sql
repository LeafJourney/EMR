-- Index audit pass 2 — clinic dashboard hot paths.
--
-- Cross-references findMany / count shapes in
-- src/app/(clinician)/clinic/page.tsx (the "mission control"
-- dashboard that every clinician opens dozens of times per day,
-- ~17 fan-out queries per render) against existing indexes. Adds
-- 5 covers for queries that were either full-scanning or relying on
-- ill-fitting composite leads.
--
-- All five use CREATE INDEX CONCURRENTLY so the migration does NOT
-- take an ACCESS EXCLUSIVE lock on the table — required for safe
-- prod deployment against live tenant data.
--
-- See docs/audit/INDEX_AUDIT_2026-05-10.md for the per-query analysis.
-- Pairs with PR #248 (chart-tab indexes pass 1).

-- 1. Encounter (organizationId, scheduledFor)
--    Covers: today's calendar, this-week count, 7-day sparkline
--    (3 queries on the dashboard).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Encounter_organizationId_scheduledFor_idx"
  ON "Encounter" ("organizationId", "scheduledFor");

-- 2. Encounter (organizationId, status, completedAt)
--    Covers: "recent completed encounters" activity feed widget.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Encounter_organizationId_status_completedAt_idx"
  ON "Encounter" ("organizationId", "status", "completedAt");

-- 3. Note (status, finalizedAt)
--    Covers: "recently finalized notes" activity feed widget. Org
--    scope is enforced by joining through encounter, so the index
--    is global on (status, finalizedAt) and the query plan does the
--    encounter-org filter as a second step.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Note_status_finalizedAt_idx"
  ON "Note" ("status", "finalizedAt");

-- 4. AgentJob (organizationId, status, completedAt)
--    Covers: fleet-bridge widget. Filters org + status IN [...] +
--    completedAt > 24h, orders by completedAt desc.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AgentJob_organizationId_status_completedAt_idx"
  ON "AgentJob" ("organizationId", "status", "completedAt");

-- 5. ChartSummary (patientId)
--    The model previously had ZERO indexes. Dashboard's
--    avg-readiness widget reads every active patient's score; the
--    join was sequential-scanning the table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChartSummary_patientId_idx"
  ON "ChartSummary" ("patientId");

-- 6. Document (organizationId, deletedAt, createdAt)
--    Covers: "recent documents" activity feed widget.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Document_organizationId_deletedAt_createdAt_idx"
  ON "Document" ("organizationId", "deletedAt", "createdAt");
