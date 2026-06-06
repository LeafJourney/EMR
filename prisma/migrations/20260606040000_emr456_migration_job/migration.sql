-- EMR-456 — idempotent, resumable migration import job ledger.
CREATE TYPE "MigrationJobStatus" AS ENUM ('queued', 'running', 'completed_with_errors', 'completed', 'failed', 'cancelled');

CREATE TABLE "MigrationJob" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "migrationProfileId" TEXT NOT NULL,
  "configurationId" TEXT,
  "sourceType" TEXT,
  "status" "MigrationJobStatus" NOT NULL DEFAULT 'queued',
  "idempotencyKey" TEXT,
  "rowsTotal" INTEGER NOT NULL DEFAULT 0,
  "rowsCompleted" INTEGER NOT NULL DEFAULT 0,
  "rowsFailed" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "createdById" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MigrationJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MigrationJob_migrationProfileId_idempotencyKey_key"
  ON "MigrationJob"("migrationProfileId", "idempotencyKey");
CREATE INDEX "MigrationJob_organizationId_status_idx" ON "MigrationJob"("organizationId", "status");
CREATE INDEX "MigrationJob_migrationProfileId_idx" ON "MigrationJob"("migrationProfileId");
