-- Index audit 2026-05-09 — patient detail page hot paths.
--
-- Adds 5 composite indexes that cover findMany shapes in
-- src/app/(clinician)/clinic/patients/[id]/page.tsx. Cross-referenced
-- against existing indexes per docs/audit/INDEX_AUDIT_2026-05-09.md.
-- Each is small (composite on already-cardinal columns), low storage
-- cost, real read benefit on chart-tab loads.
--
-- All five use CREATE INDEX CONCURRENTLY so the migration does not
-- take an ACCESS EXCLUSIVE lock on the table — required for prod
-- deployment against live tenant data. Postgres requires
-- CONCURRENTLY indexes to live OUTSIDE a transaction; Prisma's
-- migrate runner handles each statement individually so this is
-- safe.
--
-- Rollback: each index is independently DROP-able with
--   DROP INDEX CONCURRENTLY IF EXISTS "<name>";

-- 1. ClinicalObservation chart-tab unfiltered list.
--    Read: where patientId, orderBy createdAt desc. Existing compound
--    indexes start with patientId but require a category/severity
--    predicate to be useful. This one covers the bare patientId+order.
CREATE INDEX IF NOT EXISTS "ClinicalObservation_patientId_createdAt_idx"
  ON "ClinicalObservation" ("patientId", "createdAt");

-- 2. Claim open-claim count for the chart tab.
--    Read: count where patientId AND status IN (...). Existing
--    patientId+serviceDate index doesn't cover a status filter when
--    serviceDate isn't in the predicate.
CREATE INDEX IF NOT EXISTS "Claim_patientId_status_idx"
  ON "Claim" ("patientId", "status");

-- 3. Task chart-tab open-task list.
--    Read: where patientId AND status='open', orderBy dueAt asc.
--    Existing indexes are on (organizationId, status) and
--    (assigneeUserId, status) — neither leads with patientId.
CREATE INDEX IF NOT EXISTS "Task_patientId_status_dueAt_idx"
  ON "Task" ("patientId", "status", "dueAt");

-- 4. Encounter charting-time benchmark.
--    Read: where organizationId AND startedAt IS NOT NULL AND
--    chartingCompletedAt IS NOT NULL, orderBy chartingCompletedAt desc.
--    Existing organizationId+status+createdAt index is on the wrong
--    sort column.
CREATE INDEX IF NOT EXISTS "Encounter_organizationId_chartingCompletedAt_idx"
  ON "Encounter" ("organizationId", "chartingCompletedAt");

-- 5. DosingRegimen chart-tab history.
--    Read: where patientId, orderBy startDate desc. Existing
--    patientId+active index doesn't cover the ordering when `active`
--    isn't in the predicate.
CREATE INDEX IF NOT EXISTS "DosingRegimen_patientId_startDate_idx"
  ON "DosingRegimen" ("patientId", "startDate");
