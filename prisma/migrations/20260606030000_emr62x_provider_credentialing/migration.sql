-- EMR-625/627/628/629 — Provider credentialing.

CREATE TYPE "CredentialStatus" AS ENUM ('pending', 'active', 'flagged', 'suspended', 'expired');
CREATE TYPE "CredentialVerificationSource" AS ENUM ('npdb', 'oig_leie', 'sam_exclusions', 'state_license_board', 'dea', 'abms_board_certification', 'education', 'work_history');
CREATE TYPE "CredentialVerificationStatus" AS ENUM ('pending', 'verified', 'flagged', 'failed');
CREATE TYPE "PayerEnrollmentStatus" AS ENUM ('not_started', 'in_progress', 'submitted', 'approved', 'denied', 'revalidation', 'terminated');
CREATE TYPE "ProviderExclusionSource" AS ENUM ('oig_leie', 'sam_exclusions', 'state_license_board');
CREATE TYPE "ProviderExclusionStatus" AS ENUM ('active', 'cleared', 'reinstated');

CREATE TABLE "ProviderCredential" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "npi" TEXT,
  "deaNumber" TEXT,
  "deaExpiresAt" TIMESTAMP(3),
  "licenseNumber" TEXT,
  "licenseState" TEXT,
  "licenseExpiresAt" TIMESTAMP(3),
  "malpracticeCarrier" TEXT,
  "malpracticeExpiresAt" TIMESTAMP(3),
  "boardCertification" TEXT,
  "boardCertExpiresAt" TIMESTAMP(3),
  "caqhId" TEXT,
  "status" "CredentialStatus" NOT NULL DEFAULT 'pending',
  "credentialedAt" TIMESTAMP(3),
  "nextRecredentialAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProviderCredential_providerId_key" ON "ProviderCredential"("providerId");
CREATE INDEX "ProviderCredential_organizationId_status_idx" ON "ProviderCredential"("organizationId", "status");
CREATE INDEX "ProviderCredential_organizationId_nextRecredentialAt_idx" ON "ProviderCredential"("organizationId", "nextRecredentialAt");

CREATE TABLE "CredentialVerification" (
  "id" TEXT NOT NULL,
  "providerCredentialId" TEXT NOT NULL,
  "source" "CredentialVerificationSource" NOT NULL,
  "status" "CredentialVerificationStatus" NOT NULL DEFAULT 'pending',
  "result" JSONB,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CredentialVerification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CredentialVerification_providerCredentialId_source_idx" ON "CredentialVerification"("providerCredentialId", "source");
CREATE INDEX "CredentialVerification_status_idx" ON "CredentialVerification"("status");
ALTER TABLE "CredentialVerification"
  ADD CONSTRAINT "CredentialVerification_providerCredentialId_fkey"
  FOREIGN KEY ("providerCredentialId") REFERENCES "ProviderCredential"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PayerEnrollment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "payerKey" TEXT NOT NULL,
  "payerName" TEXT,
  "status" "PayerEnrollmentStatus" NOT NULL DEFAULT 'not_started',
  "rosterId" TEXT,
  "effectiveAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "revalidationDueAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayerEnrollment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayerEnrollment_providerId_payerKey_key" ON "PayerEnrollment"("providerId", "payerKey");
CREATE INDEX "PayerEnrollment_organizationId_status_idx" ON "PayerEnrollment"("organizationId", "status");

CREATE TABLE "ProviderExclusion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "source" "ProviderExclusionSource" NOT NULL,
  "status" "ProviderExclusionStatus" NOT NULL DEFAULT 'active',
  "exclusionDate" TIMESTAMP(3),
  "reinstatementDate" TIMESTAMP(3),
  "details" JSONB,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderExclusion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProviderExclusion_organizationId_status_idx" ON "ProviderExclusion"("organizationId", "status");
CREATE INDEX "ProviderExclusion_providerId_status_idx" ON "ProviderExclusion"("providerId", "status");
