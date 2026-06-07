-- EMR-724 — SaaS billing & AI brokering: append-only token-usage ledger.
CREATE TABLE "LlmUsage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "agentBucket" TEXT NOT NULL,
  "agentName" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "tokensIn" INTEGER NOT NULL DEFAULT 0,
  "tokensOut" INTEGER NOT NULL DEFAULT 0,
  "costMicroCents" INTEGER,
  "latencyMs" INTEGER NOT NULL DEFAULT 0,
  "ok" BOOLEAN NOT NULL DEFAULT true,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LlmUsage_organizationId_createdAt_idx" ON "LlmUsage"("organizationId", "createdAt");
CREATE INDEX "LlmUsage_organizationId_agentBucket_idx" ON "LlmUsage"("organizationId", "agentBucket");

ALTER TABLE "LlmUsage" ADD CONSTRAINT "LlmUsage_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
