-- Phase 1 — dedicated per-org AI credential (secrets out of the config blob).
-- managed accounts use the platform key (encryptedApiKey null); byok accounts
-- store an AES-256-GCM envelope of their own provider key.

CREATE TYPE "OrgAiMode" AS ENUM ('managed', 'byok');

CREATE TABLE "OrgAiCredential" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "mode" "OrgAiMode" NOT NULL DEFAULT 'managed',
  "provider" TEXT,
  "modelId" TEXT,
  "encryptedApiKey" TEXT,
  "keySetAt" TIMESTAMP(3),
  "keySetById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrgAiCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgAiCredential_organizationId_key" ON "OrgAiCredential"("organizationId");

ALTER TABLE "OrgAiCredential" ADD CONSTRAINT "OrgAiCredential_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrgAiCredential" ADD CONSTRAINT "OrgAiCredential_keySetById_fkey"
  FOREIGN KEY ("keySetById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
