-- EMR-951 — AgentJob "All Jobs" chronological filter + claimNextJob ordering.
-- Covers WHERE status = ? ORDER BY "createdAt", which the existing
-- (status, runAfter) index does not satisfy for the createdAt sort.
CREATE INDEX IF NOT EXISTS "AgentJob_status_createdAt_idx" ON "AgentJob"("status", "createdAt");
