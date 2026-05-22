-- -----------------------------------------------------------------------------
-- Cumulative Schema Sync (Idempotent)
-- Recovers orphaned schema additions that were merged without migration files.
-- Safe to run even if 'prisma db push' was previously used.
-- -----------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE "AnomalySeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "mfaGraceUntil" TIMESTAMP(3);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "clerkId" TEXT;
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET DEFAULT '';

CREATE TABLE IF NOT EXISTS "BootstrapAllowlistSnapshot" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "emails" TEXT[],
    "deploySha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BootstrapAllowlistSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MutationBudgetAlarm" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastAlertedAt" TIMESTAMP(3) NOT NULL,
    "perMinAtAlert" INTEGER NOT NULL,
    "per5MinAtAlert" INTEGER NOT NULL,

    CONSTRAINT "MutationBudgetAlarm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SessionKillList" (
    "userId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "revokedById" TEXT NOT NULL,

    CONSTRAINT "SessionKillList_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "PracticeHealth" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeHealth_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ControllerAuditExport" (
    "id" TEXT NOT NULL,
    "coveredDate" TIMESTAMP(3) NOT NULL,
    "storageKey" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "byteCount" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControllerAuditExport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Anomaly" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" "AnomalySeverity" NOT NULL,
    "practiceId" TEXT,
    "message" TEXT NOT NULL,
    "deeplinkUrl" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "ttlSeconds" INTEGER NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Anomaly_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_clerkId_key" ON "User"("clerkId");
CREATE INDEX IF NOT EXISTS "BootstrapAllowlistSnapshot_createdAt_idx" ON "BootstrapAllowlistSnapshot"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MutationBudgetAlarm_actorUserId_lastAlertedAt_idx" ON "MutationBudgetAlarm"("actorUserId", "lastAlertedAt" DESC);
CREATE INDEX IF NOT EXISTS "SessionKillList_expiresAt_idx" ON "SessionKillList"("expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PracticeHealth_organizationId_key" ON "PracticeHealth"("organizationId");
CREATE INDEX IF NOT EXISTS "PracticeHealth_score_idx" ON "PracticeHealth"("score");
CREATE UNIQUE INDEX IF NOT EXISTS "ControllerAuditExport_coveredDate_key" ON "ControllerAuditExport"("coveredDate");
CREATE INDEX IF NOT EXISTS "ControllerAuditExport_runAt_idx" ON "ControllerAuditExport"("runAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Anomaly_slug_key" ON "Anomaly"("slug");
CREATE INDEX IF NOT EXISTS "Anomaly_resolvedAt_severity_lastSeenAt_idx" ON "Anomaly"("resolvedAt", "severity", "lastSeenAt" DESC);
CREATE INDEX IF NOT EXISTS "Anomaly_practiceId_resolvedAt_idx" ON "Anomaly"("practiceId", "resolvedAt");
CREATE INDEX IF NOT EXISTS "Anomaly_kind_resolvedAt_idx" ON "Anomaly"("kind", "resolvedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Anomaly_kind_idempotencyKey_key" ON "Anomaly"("kind", "idempotencyKey");
