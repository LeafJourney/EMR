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
    memberId: ctx.patient.id, // production reads from Coverage; placeholder for V1
    firstName: ctx.patient.firstName,
    lastName: ctx.patient.lastName,
    middleName: null,
    dateOfBirth: ctx.patient.dateOfBirth ?? new Date(0),
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
    /** Diagnoses linked to THIS line (preserved from the Charge), used to
     *  derive real SV107 pointers instead of always pointing at dx #1. */
    icd10Codes?: string[];
  }>;
  const icd10 = (ctx.claim.icd10Codes ?? []) as Array<{ code: string }>;
  const claimDiagnoses = icd10.map((dx) => dx.code);

  const serviceLines: ServiceLine[] = cptCodes.map((cpt, idx) => {
    const line: ServiceLine = {
      sequence: idx + 1,
      cptCode: cpt.code,
      modifiers: cpt.modifiers ?? [],
      units: cpt.units ?? 1,
      chargeCents: Math.round((cpt.chargeAmount ?? 0) * 100),
      diagnosisPointers: deriveDiagnosisPointers(cpt.icd10Codes, claimDiagnoses),
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
          primaryPayer: { name: "PRIMARY PAYER", payerId: "PRIMARY" }, // V1 placeholder
          primarySubscriber: subscriber,
          primaryAllowedCents: ctx.secondary.primaryAdjudication.totalAllowedCents,
          primaryPaidCents: ctx.secondary.primaryAdjudication.totalPaidCents,
          primaryEraDate: ctx.secondary.primaryAdjudication.eraDate,
          primaryCas: [],
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

/**
 * Map a service line's linked ICD-10 codes to 1-based SV107 diagnosis
 * pointers against the claim's ordered diagnosis list. Codes the claim
 * doesn't carry are dropped; the composite is capped at 4 (X12 limit).
 * Falls back to pointer [1] when the line has no resolvable linkage (legacy
 * claims built before per-line dx was preserved) — never an empty pointer on
 * a claim that has diagnoses, which would fail 837P validation.
 */
export function deriveDiagnosisPointers(
  lineIcd10: string[] | undefined,
  claimDiagnoses: string[],
): number[] {
  const pointerByDx = new Map<string, number>();
  claimDiagnoses.forEach((code, i) => {
    if (!pointerByDx.has(code)) pointerByDx.set(code, i + 1);
  });
  const pointers = (lineIcd10 ?? [])
    .map((code) => pointerByDx.get(code))
    .filter((p): p is number => p != null)
    .slice(0, 4);
  if (pointers.length > 0) return pointers;
  return claimDiagnoses.length > 0 ? [1] : [];
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
