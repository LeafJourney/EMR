-- EMR-619 / EMR-621 — clearinghouse acknowledgment, claim-status, and ERA ingestion traceability.

DO $$ BEGIN
  CREATE TYPE "ClearinghouseAcknowledgmentType" AS ENUM ('ack_999', 'ack_277ca');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClearinghouseAcknowledgmentStatus" AS ENUM ('accepted', 'accepted_with_errors', 'rejected', 'pending', 'unknown');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClearinghouseClaimStatus" AS ENUM ('pending', 'accepted', 'rejected', 'paid', 'denied', 'unknown');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EraIngestionStatus" AS ENUM ('received', 'parsed', 'posted', 'exception');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ClearinghouseAcknowledgment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "submissionId" TEXT,
  "claimId" TEXT,
  "type" "ClearinghouseAcknowledgmentType" NOT NULL,
  "status" "ClearinghouseAcknowledgmentStatus" NOT NULL,
  "acceptedClaimCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedClaimCount" INTEGER NOT NULL DEFAULT 0,
  "rawPayload" JSONB,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClearinghouseAcknowledgment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClearinghouseAcknowledgment_organizationId_receivedAt_idx"
  ON "ClearinghouseAcknowledgment"("organizationId", "receivedAt");
CREATE INDEX IF NOT EXISTS "ClearinghouseAcknowledgment_submissionId_idx"
  ON "ClearinghouseAcknowledgment"("submissionId");
CREATE INDEX IF NOT EXISTS "ClearinghouseAcknowledgment_claimId_idx"
  ON "ClearinghouseAcknowledgment"("claimId");

CREATE TABLE IF NOT EXISTS "ClearinghouseClaimStatusInquiry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "payerName" TEXT NOT NULL,
  "status" "ClearinghouseClaimStatus" NOT NULL DEFAULT 'pending',
  "requestPayload" JSONB NOT NULL DEFAULT '{}',
  "responsePayload" JSONB,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClearinghouseClaimStatusInquiry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClearinghouseClaimStatusInquiry_organizationId_requestedAt_idx"
  ON "ClearinghouseClaimStatusInquiry"("organizationId", "requestedAt");
CREATE INDEX IF NOT EXISTS "ClearinghouseClaimStatusInquiry_claimId_requestedAt_idx"
  ON "ClearinghouseClaimStatusInquiry"("claimId", "requestedAt");
CREATE INDEX IF NOT EXISTS "ClearinghouseClaimStatusInquiry_status_requestedAt_idx"
  ON "ClearinghouseClaimStatusInquiry"("status", "requestedAt");

CREATE TABLE IF NOT EXISTS "EraIngestion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eraFileId" TEXT,
  "payerName" TEXT,
  "status" "EraIngestionStatus" NOT NULL DEFAULT 'received',
  "rawPayload" TEXT,
  "parsedPayload" JSONB,
  "exceptionReason" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EraIngestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EraIngestion_organizationId_receivedAt_idx"
  ON "EraIngestion"("organizationId", "receivedAt");
CREATE INDEX IF NOT EXISTS "EraIngestion_eraFileId_idx"
  ON "EraIngestion"("eraFileId");
CREATE INDEX IF NOT EXISTS "EraIngestion_status_receivedAt_idx"
  ON "EraIngestion"("status", "receivedAt");
