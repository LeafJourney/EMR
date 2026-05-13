-- Phase 9 Track 5 — Commerce, Pharmacy & Billing
--
-- Tickets covered:
--   EMR-063: Pharmacy Communication Module with Dual Sign-Off
--   EMR-068: Patient Billing Portal — Statement Disputes
--   EMR-091: Medical Cannabis Dispensary Module
--
-- All new models are additive — no destructive changes to existing
-- tables. Indexes are scoped to (organizationId, status) on the
-- workflow tables since those are the dashboards every clinician
-- opens.

-- ============================================================
-- Enums
-- ============================================================

-- EMR-063
CREATE TYPE "PharmacyCommThreadStatus" AS ENUM (
  'open',
  'awaiting_pharmacist',
  'awaiting_provider',
  'resolved',
  'cancelled'
);

CREATE TYPE "PharmacyMessageSenderRole" AS ENUM (
  'provider',
  'pharmacist',
  'agent',
  'patient',
  'system'
);

CREATE TYPE "MedicationChangeKind" AS ENUM (
  'new_medication',
  'dose_change',
  'discontinue',
  'switch_product',
  'formulary_substitute',
  'refill_clarification'
);

CREATE TYPE "MedicationChangeStatus" AS ENUM (
  'proposed',
  'pharmacist_signed',
  'provider_signed',
  'fully_signed',
  'applied',
  'rejected',
  'withdrawn'
);

CREATE TYPE "SignoffParty" AS ENUM ('pharmacist', 'provider');

-- EMR-068
CREATE TYPE "StatementDisputeStatus" AS ENUM (
  'submitted',
  'under_review',
  'awaiting_patient',
  'resolved_corrected',
  'resolved_upheld',
  'withdrawn'
);

CREATE TYPE "StatementDisputeReason" AS ENUM (
  'charge_unrecognized',
  'service_not_received',
  'insurance_should_cover',
  'duplicate_charge',
  'wrong_amount',
  'wrong_diagnosis',
  'identity_concern',
  'other'
);

-- EMR-091
CREATE TYPE "CannabisCardStatus" AS ENUM ('active', 'expired', 'revoked', 'pending');

CREATE TYPE "CannabisRxStatus" AS ENUM (
  'draft',
  'sent_to_dispensary',
  'approved_by_dispensary',
  'rejected_by_dispensary',
  'partially_dispensed',
  'fully_dispensed',
  'cancelled',
  'expired'
);

CREATE TYPE "CuresPdmpFlag" AS ENUM (
  'conflicting_scripts',
  'early_refill',
  'multiple_prescribers',
  'multiple_pharmacies',
  'controlled_substance_combo',
  'no_findings'
);

-- ============================================================
-- EMR-063 Tables
-- ============================================================

CREATE TABLE "PharmacyContact" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "npi"              TEXT,
  "licenseNumber"    TEXT,
  "licenseState"     TEXT,
  "phone"            TEXT,
  "fax"              TEXT,
  "email"            TEXT,
  "addressLine1"     TEXT,
  "addressLine2"     TEXT,
  "city"             TEXT,
  "state"            TEXT,
  "postalCode"       TEXT,
  "preferredChannel" TEXT DEFAULT 'portal',
  "active"           BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PharmacyContact_organizationId_active_idx" ON "PharmacyContact"("organizationId", "active");
CREATE INDEX "PharmacyContact_npi_idx" ON "PharmacyContact"("npi");

CREATE TABLE "PharmacyCommThread" (
  "id"                TEXT NOT NULL,
  "organizationId"    TEXT NOT NULL,
  "patientId"         TEXT NOT NULL,
  "medicationId"      TEXT,
  "pharmacyContactId" TEXT NOT NULL,
  "subject"           TEXT NOT NULL,
  "status"            "PharmacyCommThreadStatus" NOT NULL DEFAULT 'open',
  "openedById"        TEXT NOT NULL,
  "closedAt"          TIMESTAMP(3),
  "lastMessageAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyCommThread_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PharmacyCommThread_organizationId_status_lastMessageAt_idx" ON "PharmacyCommThread"("organizationId", "status", "lastMessageAt");
CREATE INDEX "PharmacyCommThread_patientId_status_idx" ON "PharmacyCommThread"("patientId", "status");

CREATE TABLE "PharmacyCommMessage" (
  "id"           TEXT NOT NULL,
  "threadId"     TEXT NOT NULL,
  "senderRole"   "PharmacyMessageSenderRole" NOT NULL,
  "senderUserId" TEXT,
  "senderName"   TEXT NOT NULL,
  "body"         TEXT NOT NULL,
  "attachments"  JSONB NOT NULL DEFAULT '[]',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PharmacyCommMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PharmacyCommMessage_threadId_createdAt_idx" ON "PharmacyCommMessage"("threadId", "createdAt");

CREATE TABLE "MedicationChangeRequest" (
  "id"              TEXT NOT NULL,
  "organizationId"  TEXT NOT NULL,
  "threadId"        TEXT NOT NULL,
  "patientId"       TEXT NOT NULL,
  "medicationId"    TEXT,
  "proposedById"    TEXT NOT NULL,
  "proposedByRole"  "PharmacyMessageSenderRole" NOT NULL,
  "kind"            "MedicationChangeKind" NOT NULL,
  "status"          "MedicationChangeStatus" NOT NULL DEFAULT 'proposed',
  "rationale"       TEXT NOT NULL,
  "beforeJson"      JSONB,
  "afterJson"       JSONB NOT NULL,
  "appliedAt"       TIMESTAMP(3),
  "appliedById"     TEXT,
  "rejectedAt"      TIMESTAMP(3),
  "rejectedReason"  TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MedicationChangeRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MedicationChangeRequest_organizationId_status_idx" ON "MedicationChangeRequest"("organizationId", "status");
CREATE INDEX "MedicationChangeRequest_threadId_idx" ON "MedicationChangeRequest"("threadId");
CREATE INDEX "MedicationChangeRequest_patientId_status_idx" ON "MedicationChangeRequest"("patientId", "status");

CREATE TABLE "MedicationChangeSignoff" (
  "id"         TEXT NOT NULL,
  "requestId"  TEXT NOT NULL,
  "party"      "SignoffParty" NOT NULL,
  "signedById" TEXT NOT NULL,
  "signedName" TEXT NOT NULL,
  "npi"        TEXT,
  "decision"   TEXT NOT NULL,
  "comments"   TEXT,
  "signedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicationChangeSignoff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MedicationChangeSignoff_requestId_party_key" ON "MedicationChangeSignoff"("requestId", "party");
CREATE INDEX "MedicationChangeSignoff_requestId_idx" ON "MedicationChangeSignoff"("requestId");

-- ============================================================
-- EMR-068 Tables
-- ============================================================

CREATE TABLE "StatementDispute" (
  "id"                  TEXT NOT NULL,
  "organizationId"      TEXT NOT NULL,
  "patientId"           TEXT NOT NULL,
  "statementId"         TEXT NOT NULL,
  "reason"              "StatementDisputeReason" NOT NULL,
  "status"              "StatementDisputeStatus" NOT NULL DEFAULT 'submitted',
  "patientNarrative"    TEXT NOT NULL,
  "disputedAmountCents" INTEGER,
  "aiDraftResolution"   TEXT,
  "resolutionNote"      TEXT,
  "resolvedAt"          TIMESTAMP(3),
  "resolvedById"        TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StatementDispute_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StatementDispute_organizationId_status_createdAt_idx" ON "StatementDispute"("organizationId", "status", "createdAt");
CREATE INDEX "StatementDispute_patientId_status_idx" ON "StatementDispute"("patientId", "status");
CREATE INDEX "StatementDispute_statementId_idx" ON "StatementDispute"("statementId");

-- ============================================================
-- EMR-091 Tables
-- ============================================================

CREATE TABLE "MedicalCannabisCard" (
  "id"                    TEXT NOT NULL,
  "patientId"             TEXT NOT NULL,
  "organizationId"        TEXT NOT NULL,
  "issuingState"          TEXT NOT NULL,
  "cardNumber"            TEXT NOT NULL,
  "status"                "CannabisCardStatus" NOT NULL DEFAULT 'active',
  "issuedOn"              TIMESTAMP(3) NOT NULL,
  "expiresOn"             TIMESTAMP(3) NOT NULL,
  "qualifyingConditions"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "recommendingPhysician" TEXT,
  "cardFrontUrl"          TEXT,
  "cardBackUrl"           TEXT,
  "verifiedAt"            TIMESTAMP(3),
  "verifiedById"          TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MedicalCannabisCard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MedicalCannabisCard_issuingState_cardNumber_key" ON "MedicalCannabisCard"("issuingState", "cardNumber");
CREATE INDEX "MedicalCannabisCard_patientId_status_idx" ON "MedicalCannabisCard"("patientId", "status");
CREATE INDEX "MedicalCannabisCard_expiresOn_idx" ON "MedicalCannabisCard"("expiresOn");

CREATE TABLE "CannabisRx" (
  "id"                TEXT NOT NULL,
  "organizationId"    TEXT NOT NULL,
  "patientId"         TEXT NOT NULL,
  "providerId"        TEXT NOT NULL,
  "cardId"            TEXT NOT NULL,
  "dispensaryId"      TEXT NOT NULL,
  "skuId"             TEXT,
  "productName"       TEXT NOT NULL,
  "productFormat"     TEXT NOT NULL,
  "thcMgPerUnit"      DOUBLE PRECISION,
  "cbdMgPerUnit"      DOUBLE PRECISION,
  "quantity"          INTEGER NOT NULL,
  "unit"              TEXT NOT NULL,
  "refills"           INTEGER NOT NULL DEFAULT 0,
  "daysSupply"        INTEGER,
  "doseInstructions"  TEXT NOT NULL,
  "diagnosisCodes"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status"            "CannabisRxStatus" NOT NULL DEFAULT 'draft',
  "rejectedReason"    TEXT,
  "signedAt"          TIMESTAMP(3),
  "sentAt"            TIMESTAMP(3),
  "approvedAt"        TIMESTAMP(3),
  "expiresOn"         TIMESTAMP(3),
  "notes"             TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CannabisRx_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CannabisRx_organizationId_status_idx" ON "CannabisRx"("organizationId", "status");
CREATE INDEX "CannabisRx_patientId_status_idx" ON "CannabisRx"("patientId", "status");
CREATE INDEX "CannabisRx_dispensaryId_status_idx" ON "CannabisRx"("dispensaryId", "status");

CREATE TABLE "DispensaryDispense" (
  "id"                       TEXT NOT NULL,
  "organizationId"           TEXT NOT NULL,
  "dispensaryId"             TEXT NOT NULL,
  "patientId"                TEXT NOT NULL,
  "cardId"                   TEXT NOT NULL,
  "rxId"                     TEXT,
  "skuId"                    TEXT,
  "productName"              TEXT NOT NULL,
  "productSku"               TEXT NOT NULL,
  "quantity"                 INTEGER NOT NULL,
  "unit"                     TEXT NOT NULL,
  "totalCents"               INTEGER NOT NULL,
  "thcMgPerUnit"             DOUBLE PRECISION,
  "cbdMgPerUnit"             DOUBLE PRECISION,
  "budtenderName"            TEXT NOT NULL,
  "budtenderLicense"         TEXT,
  "budtenderSignature"       TEXT NOT NULL,
  "dispensedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stateRegistryForwardedAt" TIMESTAMP(3),
  "stateRegistryReference"   TEXT,
  "notes"                    TEXT,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DispensaryDispense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DispensaryDispense_organizationId_dispensedAt_idx" ON "DispensaryDispense"("organizationId", "dispensedAt");
CREATE INDEX "DispensaryDispense_patientId_dispensedAt_idx" ON "DispensaryDispense"("patientId", "dispensedAt");
CREATE INDEX "DispensaryDispense_dispensaryId_dispensedAt_idx" ON "DispensaryDispense"("dispensaryId", "dispensedAt");
CREATE INDEX "DispensaryDispense_stateRegistryForwardedAt_idx" ON "DispensaryDispense"("stateRegistryForwardedAt");

CREATE TABLE "CuresPdmpCheck" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "patientId"        TEXT NOT NULL,
  "requestedById"    TEXT NOT NULL,
  "jurisdiction"     TEXT NOT NULL,
  "pdmpSystem"       TEXT NOT NULL,
  "queryReference"   TEXT,
  "flags"            "CuresPdmpFlag"[] NOT NULL,
  "rawResponse"      JSONB,
  "acknowledgedAt"   TIMESTAMP(3),
  "acknowledgedById" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CuresPdmpCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CuresPdmpCheck_organizationId_createdAt_idx" ON "CuresPdmpCheck"("organizationId", "createdAt");
CREATE INDEX "CuresPdmpCheck_patientId_createdAt_idx" ON "CuresPdmpCheck"("patientId", "createdAt");

-- ============================================================
-- Foreign keys
-- ============================================================

ALTER TABLE "PharmacyContact" ADD CONSTRAINT "PharmacyContact_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PharmacyCommThread" ADD CONSTRAINT "PharmacyCommThread_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyCommThread" ADD CONSTRAINT "PharmacyCommThread_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyCommThread" ADD CONSTRAINT "PharmacyCommThread_medicationId_fkey"
  FOREIGN KEY ("medicationId") REFERENCES "PatientMedication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyCommThread" ADD CONSTRAINT "PharmacyCommThread_pharmacyContactId_fkey"
  FOREIGN KEY ("pharmacyContactId") REFERENCES "PharmacyContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyCommThread" ADD CONSTRAINT "PharmacyCommThread_openedById_fkey"
  FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PharmacyCommMessage" ADD CONSTRAINT "PharmacyCommMessage_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "PharmacyCommThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyCommMessage" ADD CONSTRAINT "PharmacyCommMessage_senderUserId_fkey"
  FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MedicationChangeRequest" ADD CONSTRAINT "MedicationChangeRequest_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "PharmacyCommThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationChangeRequest" ADD CONSTRAINT "MedicationChangeRequest_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationChangeRequest" ADD CONSTRAINT "MedicationChangeRequest_medicationId_fkey"
  FOREIGN KEY ("medicationId") REFERENCES "PatientMedication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MedicationChangeRequest" ADD CONSTRAINT "MedicationChangeRequest_proposedById_fkey"
  FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicationChangeRequest" ADD CONSTRAINT "MedicationChangeRequest_appliedById_fkey"
  FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MedicationChangeSignoff" ADD CONSTRAINT "MedicationChangeSignoff_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "MedicationChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationChangeSignoff" ADD CONSTRAINT "MedicationChangeSignoff_signedById_fkey"
  FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StatementDispute" ADD CONSTRAINT "StatementDispute_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StatementDispute" ADD CONSTRAINT "StatementDispute_statementId_fkey"
  FOREIGN KEY ("statementId") REFERENCES "Statement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StatementDispute" ADD CONSTRAINT "StatementDispute_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MedicalCannabisCard" ADD CONSTRAINT "MedicalCannabisCard_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicalCannabisCard" ADD CONSTRAINT "MedicalCannabisCard_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicalCannabisCard" ADD CONSTRAINT "MedicalCannabisCard_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CannabisRx" ADD CONSTRAINT "CannabisRx_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CannabisRx" ADD CONSTRAINT "CannabisRx_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CannabisRx" ADD CONSTRAINT "CannabisRx_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CannabisRx" ADD CONSTRAINT "CannabisRx_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "MedicalCannabisCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CannabisRx" ADD CONSTRAINT "CannabisRx_dispensaryId_fkey"
  FOREIGN KEY ("dispensaryId") REFERENCES "Dispensary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CannabisRx" ADD CONSTRAINT "CannabisRx_skuId_fkey"
  FOREIGN KEY ("skuId") REFERENCES "DispensarySku"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DispensaryDispense" ADD CONSTRAINT "DispensaryDispense_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispensaryDispense" ADD CONSTRAINT "DispensaryDispense_dispensaryId_fkey"
  FOREIGN KEY ("dispensaryId") REFERENCES "Dispensary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DispensaryDispense" ADD CONSTRAINT "DispensaryDispense_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispensaryDispense" ADD CONSTRAINT "DispensaryDispense_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "MedicalCannabisCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DispensaryDispense" ADD CONSTRAINT "DispensaryDispense_rxId_fkey"
  FOREIGN KEY ("rxId") REFERENCES "CannabisRx"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DispensaryDispense" ADD CONSTRAINT "DispensaryDispense_skuId_fkey"
  FOREIGN KEY ("skuId") REFERENCES "DispensarySku"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CuresPdmpCheck" ADD CONSTRAINT "CuresPdmpCheck_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CuresPdmpCheck" ADD CONSTRAINT "CuresPdmpCheck_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CuresPdmpCheck" ADD CONSTRAINT "CuresPdmpCheck_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CuresPdmpCheck" ADD CONSTRAINT "CuresPdmpCheck_acknowledgedById_fkey"
  FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
