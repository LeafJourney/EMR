// EMR-219 — secondaryClaimAgent
// -----------------------------
// Wakes on `claim.paid` / `claim.partial` events. When the patient has a
// secondary coverage on file AND the primary adjudication produced
// non-zero CAS adjustments, builds a secondary 837P with the primary
// payer's Loop 2320 / 2430 detail and writes it to a new
// ClearinghouseSubmission row (isSecondary=true,
// primaryAdjudicationId=<source>).
//
// Per the ticket:
//   - Secondary timely-filing window starts from the *primary ERA date*,
//     not the original DOS — payer-dependent
//   - REF*F8 carries the primary payer's claim control number
//
// The actual gateway transmission stays with the existing
// clearinghouseSubmissionAgent — this agent only constructs the secondary
// EDI and queues it for that agent to pick up.

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
import { startReasoning } from "../memory/agent-reasoning";
import { build837P, type Claim837Input, type ClaimAdjustment } from "@/lib/billing/edi/edi-837p";
import { deriveDiagnosisPointers } from "@/lib/billing/edi/build-from-claim";
import { validateSnip1to5 } from "@/lib/billing/edi/snip-validator";
import { resolveBillingIdentifiers } from "@/lib/billing/identifiers";
import { resolvePayerRuleAsync } from "@/lib/billing/payer-rules-db";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const input = z.object({
  claimId: z.string(),
  organizationId: z.string(),
  /** AdjudicationResult.id from the primary payer that triggered this run. */
  primaryAdjudicationId: z.string(),
});

const output = z.object({
  claimId: z.string(),
  secondarySubmissionId: z.string().nullable(),
  status: z.enum([
    "queued",
    "skipped_no_secondary",
    "skipped_zero_adjustments",
    "skipped_already_filed",
    "error_claim_not_found",
    "error_adjudication_not_found",
    "error_secondary_payer_excluded",
    "error_timely_filing_expired",
  ]),
  snipPassed: z.boolean(),
  snipFindingCount: z.number(),
});

// ---------------------------------------------------------------------------
// Pure helpers (testable without Prisma)
// ---------------------------------------------------------------------------

/** Sum of all CAS amounts on the primary adjudication. Zero → no secondary
 *  submission needed (primary paid in full). */
export function totalAdjustmentCents(cas: ClaimAdjustment[]): number {
  return cas.reduce((sum, c) => sum + Math.abs(c.amountCents), 0);
}

/** Compute the secondary timely-filing deadline. Per the ticket:
 *  "timely filing starts from primary ERA date, not original DOS — payer-dependent". */
export function secondaryTimelyFilingDeadline(args: {
  primaryEraDate: Date;
  secondaryTimelyFilingDays: number;
}): Date {
  return new Date(args.primaryEraDate.getTime() + args.secondaryTimelyFilingDays * 86_400_000);
}

/** Decide whether to build a secondary based on adjudication shape. Pure. */
export function shouldBuildSecondary(input: {
  hasSecondaryCoverage: boolean;
  primaryCasAmountCents: number;
  alreadyHasSecondarySubmission: boolean;
}):
  | { build: true }
  | { build: false; reason: "no_secondary" | "zero_adjustments" | "already_filed" } {
  if (input.alreadyHasSecondarySubmission) return { build: false, reason: "already_filed" };
  if (!input.hasSecondaryCoverage) return { build: false, reason: "no_secondary" };
  if (input.primaryCasAmountCents <= 0) return { build: false, reason: "zero_adjustments" };
  return { build: true };
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const secondaryClaimAgent: Agent<z.infer<typeof input>, z.infer<typeof output>> = {
  name: "secondaryClaim",
  version: "1.0.0",
  description:
    "Constructs an 837P secondary submission from a paid/partial primary " +
    "adjudication. Writes Loop 2320/2430 CAS detail and queues the new " +
    "ClearinghouseSubmission for the gateway agent to transmit.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.claim", "write.claim.status"],
  // Builds a real 837P that will be billed to a second payer — must be
  // approval-gated so a biller signs off before the gateway picks it up.
  requiresApproval: true,

  async run({ claimId, organizationId, primaryAdjudicationId }, ctx) {
    const trace = startReasoning("secondaryClaim", "1.0.0", ctx.jobId);
    trace.step("begin secondary claim build", { claimId, primaryAdjudicationId });
    ctx.assertCan("read.claim");

    const [claim, adjudication, existingSecondary] = await Promise.all([
      prisma.claim.findUnique({
        where: { id: claimId },
        include: {
          patient: true,
          provider: { include: { user: true } },
          organization: true,
        },
      }),
      prisma.adjudicationResult.findUnique({ where: { id: primaryAdjudicationId } }),
      prisma.clearinghouseSubmission.findFirst({
        where: { claimId, isSecondary: true },
      }),
    ]);

    if (!claim) {
      trace.conclude({ confidence: 1, summary: "Claim not found." });
      await trace.persist();
      return {
        claimId,
        secondarySubmissionId: null,
        status: "error_claim_not_found",
        snipPassed: false,
        snipFindingCount: 0,
      };
    }
    if (!adjudication) {
      trace.conclude({ confidence: 1, summary: "Primary adjudication not found." });
      await trace.persist();
      return {
        claimId,
        secondarySubmissionId: null,
        status: "error_adjudication_not_found",
        snipPassed: false,
        snipFindingCount: 0,
      };
    }

    // V1: store secondary coverage in Patient.intakeAnswers under
    // "secondaryCoverage". Production reads from a Coverage table when
    // EMR-272 lands.
    const secondaryCoverage = extractSecondaryCoverage(claim.patient.intakeAnswers);

    const claimCas = parseClaimCas(adjudication.lineDetails);
    const decision = shouldBuildSecondary({
      hasSecondaryCoverage: !!secondaryCoverage,
      primaryCasAmountCents: totalAdjustmentCents(claimCas),
      alreadyHasSecondarySubmission: !!existingSecondary,
    });

    if (!decision.build) {
      const reasonMap = {
        no_secondary: "skipped_no_secondary",
        zero_adjustments: "skipped_zero_adjustments",
        already_filed: "skipped_already_filed",
      } as const;
      trace.conclude({
        confidence: 1,
        summary: `Skipped secondary build: ${decision.reason}`,
      });
      await trace.persist();
      return {
        claimId,
        secondarySubmissionId: null,
        status: reasonMap[decision.reason],
        snipPassed: false,
        snipFindingCount: 0,
      };
    }

    if (!secondaryCoverage) {
      throw new Error("Decision said build=true but secondaryCoverage was null");
    }

    const secondaryRule = await resolvePayerRuleAsync({
      payerId: secondaryCoverage.payerId,
      payerName: secondaryCoverage.payerName,
      organizationId,
    });
    if (secondaryRule.excludesCannabis) {
      trace.conclude({
        confidence: 1,
        summary: `Secondary payer ${secondaryRule.displayName} excludes cannabis services. Skipping.`,
      });
      await trace.persist();
      return {
        claimId,
        secondarySubmissionId: null,
        status: "error_secondary_payer_excluded",
        snipPassed: false,
        snipFindingCount: 0,
      };
    }
    const deadline = secondaryTimelyFilingDeadline({
      primaryEraDate: adjudication.eraDate,
      secondaryTimelyFilingDays: secondaryRule.timelyFilingDays,
    });
    if (deadline.getTime() < Date.now()) {
      ctx.log("warn", "Secondary timely-filing window has expired", {
        claimId,
        primaryEraDate: adjudication.eraDate,
        deadline,
      });
      trace.conclude({
        confidence: 1,
        summary: `Secondary timely-filing expired (deadline ${deadline.toISOString()}).`,
      });
      await trace.persist();
      return {
        claimId,
        secondarySubmissionId: null,
        status: "error_timely_filing_expired",
        snipPassed: false,
        snipFindingCount: 0,
      };
    }

    const identifiers = resolveBillingIdentifiers({
      organization: {
        id: claim.organization.id,
        billingNpi: claim.organization.billingNpi,
        taxId: claim.organization.taxId,
        billingAddress: claim.organization.billingAddress,
        payToAddress: claim.organization.payToAddress,
      },
      provider: claim.provider
        ? {
            id: claim.provider.id,
            npi: claim.provider.npi,
            taxonomyCode: claim.provider.taxonomyCode,
            bio: claim.provider.bio,
          }
        : null,
    });

    const cptCodes = (claim.cptCodes ?? []) as Array<{
      code: string;
      label?: string;
      units?: number;
      chargeAmount?: number;
      modifiers?: string[];
      icd10Codes?: string[];
    }>;
    const icd10 = (claim.icd10Codes ?? []) as Array<{ code: string }>;
    const claimDiagnoses = icd10.map((d) => d.code);

    const lineDetails = parseLineDetails(adjudication.lineDetails);

    const input837: Claim837Input = {
      submitter: {
        name: claim.organization.name.slice(0, 45),
        id: process.env.SUBMITTER_EDI_ID ?? "GREENPATH",
        contactName: process.env.SUBMITTER_CONTACT_NAME ?? "BILLING",
        contactPhone: (process.env.SUBMITTER_CONTACT_PHONE ?? "0000000000").replace(/\D/g, ""),
      },
      receiver: { name: secondaryCoverage.payerName, id: secondaryCoverage.payerId },
      billingProvider: {
        organizationName: claim.organization.name.slice(0, 45),
        npi: identifiers.billingNpi,
        taxId: identifiers.taxId.replace(/\D/g, "") || "000000000",
        taxonomyCode: identifiers.taxonomyCode,
        address: identifiers.billingAddress,
        payToAddress: identifiers.payToAddress,
      },
      subscriber: {
        memberId: secondaryCoverage.memberId,
        firstName: claim.patient.firstName,
        lastName: claim.patient.lastName,
        middleName: null,
        dateOfBirth: claim.patient.dateOfBirth ?? new Date(0),
        gender: "U",
        address: addressFromPatient(claim.patient),
        relationshipToPatient: "18",
        insuranceType: "CI",
      },
      patient: null,
      payer: { name: secondaryCoverage.payerName, payerId: secondaryCoverage.payerId },
      rendering: {
        npi: identifiers.renderingNpi,
        firstName: claim.provider?.user?.firstName ?? "RENDER",
        lastName: claim.provider?.user?.lastName ?? "PROVIDER",
        taxonomyCode: identifiers.taxonomyCode,
      },
      claim: {
        patientControlNumber: claim.id.slice(0, 38),
        totalChargeCents: claim.billedAmountCents,
        placeOfService: claim.placeOfService ?? "11",
        frequencyCode: "1",
        diagnoses: icd10.map((d) => d.code),
        serviceDate: claim.serviceDate,
        priorAuthNumber: claim.priorAuthNumber,
        notes: `Secondary submission for primary adjudication ${primaryAdjudicationId}`,
      },
      serviceLines: cptCodes.map((cpt, idx) => {
        const ld = lineDetails.find((l) => l.sequence === idx + 1);
        return {
          sequence: idx + 1,
          cptCode: cpt.code,
          modifiers: cpt.modifiers ?? [],
          units: cpt.units ?? 1,
          chargeCents: Math.round((cpt.chargeAmount ?? 0) * 100),
          diagnosisPointers: deriveDiagnosisPointers(cpt.icd10Codes, claimDiagnoses),
          serviceDate: claim.serviceDate,
          placeOfService: claim.placeOfService ?? undefined,
          primaryAdjudication: ld
            ? {
                allowedCents: ld.allowedCents,
                paidCents: ld.paidCents,
                cas: ld.cas,
                eraDate: adjudication.eraDate,
              }
            : undefined,
        };
      }),
      secondary: {
        primaryPayer: {
          name: claim.payerName ?? "PRIMARY PAYER",
          payerId: claim.payerId ?? "PRIMARY",
        },
        primarySubscriber: {
          memberId: secondaryCoverage.primaryMemberId ?? "UNKNOWN",
          firstName: claim.patient.firstName,
          lastName: claim.patient.lastName,
          dateOfBirth: claim.patient.dateOfBirth ?? new Date(0),
          gender: "U",
          address: addressFromPatient(claim.patient),
          relationshipToPatient: "18",
          insuranceType: "CI",
        },
        primaryAllowedCents: adjudication.totalAllowedCents,
        primaryPaidCents: adjudication.totalPaidCents,
        primaryEraDate: adjudication.eraDate,
        // `claimCas` here is the flattened set of LINE-level CAS, which is
        // already emitted per-line in Loop 2430 below. Re-emitting it as
        // claim-level CAS in Loop 2320 double-counts every adjustment on the
        // secondary 837P (wrong COB balance / payer rejection). Loop 2320
        // carries the claim-level COB summary via AMT (primaryPaid/allowed);
        // line adjustments belong only in 2430. (Matches build-from-claim.ts,
        // which passes []. `claimCas` is still used for the metric above.)
        primaryCas: [],
        primaryClaimControlNumber: adjudication.checkNumber ?? "",
      },
    };

    const built = build837P(input837, {
      isaControlNumber: deriveIsaControl(adjudication.id),
      gsControlNumber: deriveGsControl(adjudication.id),
      stControlNumber: "0001",
      usageIndicator: process.env.NODE_ENV === "production" ? "P" : "T",
    });

    const snip = validateSnip1to5(built.payload);

    ctx.assertCan("write.claim.status");
    const submission = await prisma.clearinghouseSubmission.create({
      data: {
        claimId,
        organizationId,
        clearinghouseName: process.env.CLEARINGHOUSE_NAME ?? "SimulatedClearinghouse",
        ediPayload: built.payload,
        responseStatus: "pending",
        retryCount: 0,
        isSecondary: true,
        primaryAdjudicationId: adjudication.id,
      },
    });

    await writeAgentAudit(
      "secondaryClaim",
      "1.0.0",
      organizationId,
      "secondary.queued",
      { type: "ClearinghouseSubmission", id: submission.id },
      {
        claimId,
        primaryAdjudicationId: adjudication.id,
        snipPassed: snip.passed,
        snipFindingCount: snip.findings.length,
        secondaryPayerId: secondaryCoverage.payerId,
      },
    );

    await ctx.emit({
      name: "clearinghouse.queued",
      claimId,
      submissionId: submission.id,
      organizationId,
      isSecondary: true,
    } as any);

    trace.conclude({
      confidence: 0.9,
      summary: `Secondary 837P built (${built.transactionSegmentCount} segments) for ${secondaryCoverage.payerName}; SNIP findings: ${snip.findings.length}.`,
    });
    await trace.persist();

    return {
      claimId,
      secondarySubmissionId: submission.id,
      status: "queued",
      snipPassed: snip.passed,
      snipFindingCount: snip.findings.length,
    };
  },
};

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

interface SecondaryCoverage {
  payerName: string;
  payerId: string;
  memberId: string;
  primaryMemberId?: string;
}

/** Pull the secondary coverage from intakeAnswers JSON. Returns null when
 *  there is no `secondaryCoverage` block or it's missing required fields. */
export function extractSecondaryCoverage(intakeAnswers: unknown): SecondaryCoverage | null {
  if (!intakeAnswers || typeof intakeAnswers !== "object") return null;
  const sc = (intakeAnswers as { secondaryCoverage?: unknown }).secondaryCoverage;
  if (!sc || typeof sc !== "object") return null;
  const r = sc as Record<string, unknown>;
  if (typeof r.payerName !== "string" || typeof r.payerId !== "string" || typeof r.memberId !== "string") {
    return null;
  }
  return {
    payerName: r.payerName,
    payerId: r.payerId,
    memberId: r.memberId,
    primaryMemberId: typeof r.primaryMemberId === "string" ? r.primaryMemberId : undefined,
  };
}

interface ParsedLineDetail {
  sequence: number;
  allowedCents: number;
  paidCents: number;
  cas: ClaimAdjustment[];
}

function parseLineDetails(raw: unknown): ParsedLineDetail[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      const o = r as Record<string, unknown>;
      const seq = typeof o.sequence === "number" ? o.sequence : null;
      const allowed = typeof o.allowedCents === "number" ? o.allowedCents : 0;
      const paid = typeof o.paidCents === "number" ? o.paidCents : 0;
      const cas = Array.isArray(o.cas) ? (o.cas as ClaimAdjustment[]) : [];
      if (seq == null) return null;
      return { sequence: seq, allowedCents: allowed, paidCents: paid, cas };
    })
    .filter((x): x is ParsedLineDetail => x !== null);
}

/** Aggregate line-level CAS into a claim-level CAS list — used for the
 *  Loop 2320 claim-level adjustment summary. */
function parseClaimCas(raw: unknown): ClaimAdjustment[] {
  const lines = parseLineDetails(raw);
  return lines.flatMap((l) => l.cas);
}

function addressFromPatient(p: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}) {
  return {
    line1: p.addressLine1 ?? "UNKNOWN",
    line2: p.addressLine2,
    city: p.city ?? "UNKNOWN",
    state: (p.state ?? "XX").slice(0, 2).toUpperCase(),
    postalCode: (p.postalCode ?? "00000").replace(/\D/g, "") || "00000",
  };
}

/** Deterministic ISA control number derived from the adjudication id so that
 *  retried builds for the same adjudication produce the same control number
 *  (clearinghouse de-dup). Hash → 9-digit number. */
export function deriveIsaControl(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 1_000_000_000;
}

export function deriveGsControl(seed: string): number {
  return Math.max(1, deriveIsaControl(seed) % 1_000_000);
}
