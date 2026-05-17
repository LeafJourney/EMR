-- EMR-732 — PracticeHealth: per-practice composite health score.
--
-- Additive: a new denormalized table populated by the
-- `cron/practice-health` route. No FK constraint on organizationId in
-- v1 — the cron pre-filters to live practices and the row is
-- idempotently upserted; we'd rather not couple cron writes to
-- Organization existence checks at this layer.

CREATE TABLE "PracticeHealth" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "score"          INTEGER NOT NULL,
  "breakdown"      JSONB NOT NULL,
  "computedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PracticeHealth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PracticeHealth_organizationId_key" ON "PracticeHealth"("organizationId");
CREATE INDEX "PracticeHealth_score_idx" ON "PracticeHealth"("score");
