-- Phase 0 telemetry — agent acceptance / time-saved ledger.
-- Activity telemetry (AgentJob, LlmUsage) answers "did it run and what did it
-- cost?". This table answers "did a human use the output, and how much time
-- did it save?" — the proof of real workflow advantage. Append-only.

CREATE TYPE "AgentOutcomeDecision" AS ENUM (
  'accepted',
  'accepted_with_edits',
  'rejected',
  'dismissed',
  'auto_applied'
);

CREATE TABLE "AgentOutcome" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "agentJobId" TEXT,
  "agentName" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT,
  "decision" "AgentOutcomeDecision" NOT NULL,
  "estimatedMinutesSaved" INTEGER,
  "decidedById" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentOutcome_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentOutcome_organizationId_createdAt_idx" ON "AgentOutcome"("organizationId", "createdAt");
CREATE INDEX "AgentOutcome_organizationId_agentName_idx" ON "AgentOutcome"("organizationId", "agentName");
CREATE INDEX "AgentOutcome_subjectType_subjectId_idx" ON "AgentOutcome"("subjectType", "subjectId");
CREATE INDEX "AgentOutcome_agentJobId_idx" ON "AgentOutcome"("agentJobId");

ALTER TABLE "AgentOutcome" ADD CONSTRAINT "AgentOutcome_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentOutcome" ADD CONSTRAINT "AgentOutcome_agentJobId_fkey"
  FOREIGN KEY ("agentJobId") REFERENCES "AgentJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentOutcome" ADD CONSTRAINT "AgentOutcome_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
