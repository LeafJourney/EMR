-- EMR-456 — staging payload + per-run result for the resumable import runner.
ALTER TABLE "MigrationJob" ADD COLUMN "sourcePayload" JSONB;
ALTER TABLE "MigrationJob" ADD COLUMN "result" JSONB;
