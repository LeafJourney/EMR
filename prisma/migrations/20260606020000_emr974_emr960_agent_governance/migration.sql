-- EMR-974 — per-org/per-agent enable flag.
CREATE TABLE "AgentSetting" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "agentName" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentSetting_organizationId_agentName_key"
  ON "AgentSetting"("organizationId", "agentName");
CREATE INDEX "AgentSetting_organizationId_idx" ON "AgentSetting"("organizationId");

-- EMR-960 — owner default approve/reject decisions per agent/workflow.
CREATE TYPE "ApprovalDecisionScope" AS ENUM ('agent', 'workflow');
CREATE TYPE "ApprovalDecision" AS ENUM ('approve', 'reject');

CREATE TABLE "DefaultApprovalDecision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "scopeType" "ApprovalDecisionScope" NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "decision" "ApprovalDecision" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DefaultApprovalDecision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DefaultApprovalDecision_organizationId_scopeType_scopeKey_key"
  ON "DefaultApprovalDecision"("organizationId", "scopeType", "scopeKey");
CREATE INDEX "DefaultApprovalDecision_organizationId_enabled_idx"
  ON "DefaultApprovalDecision"("organizationId", "enabled");
