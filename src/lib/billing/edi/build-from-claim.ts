// EMR-216 / EMR-219 — Project a Prisma Claim row into Claim837Input
// -----------------------------------------------------------------
// The 837P generator is intentionally pure (no Prisma dependency); this
// file is the single seam that loads everything the generator needs from
// the DB and assembles the typed input shape.

import type {
  AdjudicationResult,
  Claim,
  ClearinghouseSubmission,
  Patient,
  Provider,
  Organization,
} from "@prisma/client";
import {
  build837P,
  type Built837,
  type Claim837Input,
  type ServiceLine,
  type Subscriber,
  type ClaimAdjustment,
} from "./edi-837p";
import { validateSnip1to5, type SnipReport } from "./snip-validator";
import {
  resolveBillingIdentifiers,
  type ResolvedBillingIdentifiers,
} from "../identifiers";

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------
// While the generator is rolling out we keep the stub path live as a safety
// net. Operators flip EDI_GENERATOR_MODE=real once a payer has been
// verified end-to-end on the new path.

export type EdiGeneratorMode = "real" | "stub";

export function getEdiGeneratorMode(): EdiGeneratorMode {
  const v = (process.env.EDI_GENERATOR_MODE ?? "stub").toLowerCase();
  return v === "real" ? "real" : "stub";
}

// ---------------------------------------------------------------------------
// Inputs from DB
// ---------------------------------------------------------------------------

export interface ClaimContext {
  claim: Claim;
  patient: Patient;
  organization: Organization;
  provider: Provider | null;
  /** Provider.user.{firstName, lastName}, loaded separately so we don't
   *  require eager joins everywhere. */
  renderingName: { firstName: string; lastName: string } | null;
  /** Active PatientCoverage for the claim's payer. Supplies the subscriber
   *  member ID (NM1*IL ... MI) that the payer matches against enrollment —
   *  without it we fall back to the patient id, which payers reject. */
  coverage?: {
    memberId: string;
    /** "self" | "spouse" | "child" | "other" — when not "self" the patient
     *  differs from the subscriber (Loop 2000C); V1 still files as self. */
    relationshipToSubscriber?: string | null;
  } | null;
  /** Submission control numbers — caller provides so we can re-use them on
   *  retries without burning new sequence numbers. */
  controlNumbers: {
    isaControlNumber: number;
    gsControlNumber: number;
    stControlNumber: string;
  };
  /** Filled when filing as secondary. */
  secondary?: {
    primaryAdjudication: AdjudicationResult;
    primarySubmission: Pick<ClearinghouseSubmission, "id" | "ediResponse">;
    /** The primary payer's name/id from the original claim — emitted in
     *  Loop 2330B. Falls back to a placeholder only when unknown. */
    primaryPayerName?: string | null;
    primaryPayerId?: string | null;
    /** Claim-level CAS adjustments from the primary 835 (Loop 2320). */
    primaryClaimCas?: ClaimAdjustment[];
  } | null;
}

/** Project a Prisma claim into Claim837Input + run the generator. */
export function buildClaimEdi(ctx: ClaimContext): {
  built: Built837;
  snip: SnipReport;
  identifiers: ResolvedBillingIdentifiers;
} {
  const identifiers = resolveBillingIdentifiers({
    organization: {
      id: ctx.organization.id,
      billingNpi: ctx.organization.billingNpi,
      taxId: ctx.organization.taxId,
      billingAddress: ctx.organization.billingAddress,
      payToAddress: ctx.organization.payToAddress,
    },
    provider: ctx.provider
      ? {
          id: ctx.provider.id,
          npi: ctx.provider.npi,
          taxonomyCode: ctx.provider.taxonomyCode,
          bio: ctx.provider.bio,
        }
      : null,
  });

  const subscriber: Subscriber = {
    // Prefer the payer-issued member ID from Coverage; fall back to the
    // patient id only when no coverage row is on file (degraded path).
    memberId: ctx.coverage?.memberId?.trim() || ctx.patient.id,
    firstName: ctx.patient.firstName,
    lastName: ctx.patient.lastName,
    middleName: null,
    dateOfBirth: ctx.patient.dateOfBirth ?? new Date(0),
    // Patient has no sex/gender field in the schema today, so the subscriber
    // gender is sent as "U" (unknown). Payers tolerate "U"; tighten this once
    // a demographic field exists.
    gender: "U",
    address: {
      line1: ctx.patient.addressLine1 ?? "UNKNOWN",
      line2: ctx.patient.addressLine2,
      city: ctx.patient.city ?? "UNKNOWN",
      state: (ctx.patient.state ?? "XX").slice(0, 2).toUpperCase(),
      postalCode: (ctx.patient.postalCode ?? "00000").replace(/\D/g, "") || "00000",
    },
    relationshipToPatient: "18", // self
    insuranceType: classifyInsuranceType(ctx.claim.payerName),
  };

  const cptCodes = (ctx.claim.cptCodes ?? []) as Array<{
    code: string;
    label?: string;
    units?: number;
    chargeAmount?: number;
    modifiers?: string[];
  }>;
  const icd10 = (ctx.claim.icd10Codes ?? []) as Array<{ code: string }>;

  const serviceLines: ServiceLine[] = cptCodes.map((cpt, idx) => {
    const line: ServiceLine = {
      sequence: idx + 1,
      cptCode: cpt.code,
      modifiers: cpt.modifiers ?? [],
      units: cpt.units ?? 1,
      chargeCents: Math.round((cpt.chargeAmount ?? 0) * 100),
      diagnosisPointers: icd10.length > 0 ? [1] : [],
      serviceDate: ctx.claim.serviceDate,
      placeOfService: ctx.claim.placeOfService ?? undefined,
    };

    if (ctx.secondary) {
      const lineDetails = ((ctx.secondary.primaryAdjudication.lineDetails ?? []) as unknown as Array<{
        sequence: number;
        allowedCents: number;
        paidCents: number;
        cas: ClaimAdjustment[];
      }>).find((ld) => ld.sequence === line.sequence);
      if (lineDetails) {
        line.primaryAdjudication = {
          allowedCents: lineDetails.allowedCents,
          paidCents: lineDetails.paidCents,
          cas: lineDetails.cas ?? [],
          eraDate: ctx.secondary.primaryAdjudication.eraDate,
        };
      }
    }

    return line;
  });

  const input: Claim837Input = {
    submitter: {
      name: ctx.organization.name.slice(0, 45),
      id: process.env.SUBMITTER_EDI_ID ?? "GREENPATH",
      contactName: process.env.SUBMITTER_CONTACT_NAME ?? "BILLING",
      contactPhone: (process.env.SUBMITTER_CONTACT_PHONE ?? "0000000000").replace(/\D/g, ""),
    },
    receiver: {
      name: ctx.claim.payerName ?? "UNKNOWN PAYER",
      id: ctx.claim.payerId ?? "UNKNOWN",
    },
    billingProvider: {
      organizationName: ctx.organization.name.slice(0, 45),
      npi: identifiers.billingNpi,
      taxId: identifiers.taxId.replace(/\D/g, "") || "000000000",
      taxonomyCode: identifiers.taxonomyCode,
      address: identifiers.billingAddress,
      payToAddress: identifiers.payToAddress,
    },
    subscriber,
    patient: null, // V1: subscriber === patient
    payer: { name: ctx.claim.payerName ?? "UNKNOWN PAYER", payerId: ctx.claim.payerId ?? "UNKNOWN" },
    rendering: {
      npi: identifiers.renderingNpi,
      firstName: ctx.renderingName?.firstName ?? "RENDER",
      lastName: ctx.renderingName?.lastName ?? "PROVIDER",
      taxonomyCode: identifiers.taxonomyCode,
    },
    claim: {
      patientControlNumber: ctx.claim.id.slice(0, 38),
      totalChargeCents: ctx.claim.billedAmountCents,
      placeOfService: ctx.claim.placeOfService ?? "11",
      frequencyCode: (ctx.claim.frequencyCode as "1" | "7" | "8" | undefined) ?? "1",
      diagnoses: icd10.map((dx) => dx.code),
      serviceDate: ctx.claim.serviceDate,
      priorAuthNumber: ctx.claim.priorAuthNumber,
      originalClaimControlNumber: ctx.claim.frequencyCode && ctx.claim.frequencyCode !== "1"
        ? ctx.claim.claimNumber
        : null,
      notes: ctx.claim.notes,
    },
    serviceLines,
    secondary: ctx.secondary
      ? {
          primaryPayer: {
            name: ctx.secondary.primaryPayerName?.trim() || "PRIMARY PAYER",
            payerId: ctx.secondary.primaryPayerId?.trim() || "PRIMARY",
          },
          primarySubscriber: subscriber,
          primaryAllowedCents: ctx.secondary.primaryAdjudication.totalAllowedCents,
          primaryPaidCents: ctx.secondary.primaryAdjudication.totalPaidCents,
          primaryEraDate: ctx.secondary.primaryAdjudication.eraDate,
          primaryCas: ctx.secondary.primaryClaimCas ?? [],
          primaryClaimControlNumber: ctx.secondary.primaryAdjudication.checkNumber ?? "",
        }
      : null,
  };

  const built = build837P(input, {
    isaControlNumber: ctx.controlNumbers.isaControlNumber,
    gsControlNumber: ctx.controlNumbers.gsControlNumber,
    stControlNumber: ctx.controlNumbers.stControlNumber,
    usageIndicator: process.env.NODE_ENV === "production" ? "P" : "T",
  });

  const snip = validateSnip1to5(built.payload);
  return { built, snip, identifiers };
}

/** Map our payer-name guess to the X12 insurance type code. Conservative —
 *  unknown maps to "ZZ" (mutually defined). */
function classifyInsuranceType(payerName: string | null): Subscriber["insuranceType"] {
  if (!payerName) return "ZZ";
  const lower = payerName.toLowerCase();
  if (lower.includes("medicare")) return "MB";
  if (lower.includes("medicaid") || lower.includes("medi-cal")) return "MC";
  if (lower.includes("blue cross") || lower.includes("bcbs")) return "BL";
  return "CI"; // default to commercial
}
