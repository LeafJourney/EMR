import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
import { startReasoning } from "../memory/agent-reasoning";
import {
  computeTimelyFilingDeadline,
  resolvePayerRule,
} from "@/lib/billing/payer-rules";

/**
 * Resolve billing + rendering NPI for a claim. Real practices store these
 * on the provider record or the organization settings — neither model has
 * a field yet (tracked as EMR-220). Until then we look at (in order):
 *   1. Provider bio substring "NPI:<10-digit>" — a temporary hack practices
 *      use today and something the intake form can populate.
 *   2. process.env.DEFAULT_BILLING_NPI / DEFAULT_RENDERING_NPI
 * Returns nulls when nothing resolves so the caller can escalate instead
 * of silently shipping a 10-digit-less 837P that rejects at the gateway.
 */
export function resolveBillingIdentifiers(args: {
  providerBio?: string | null;
  env?: { DEFAULT_BILLING_NPI?: string; DEFAULT_RENDERING_NPI?: string };
}): { billingNpi: string | null; renderingNpi: string | null } {
  const npiFromBio = args.providerBio?.match(/NPI[:\s]+(\d{10})/i)?.[1] ?? null;
  const env =
    args.env ??
    (typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)
      : {});
  const billingNpi = npiFromBio ?? env.DEFAULT_BILLING_NPI ?? null;
  const renderingNpi = npiFromBio ?? env.DEFAULT_RENDERING_NPI ?? billingNpi;
  return { billingNpi, renderingNpi };
}

// ---------------------------------------------------------------------------
// Claim Construction Agent
// ---------------------------------------------------------------------------
// Third agent in the clean claim path. Takes coded charges from an encounter
// and assembles them into a valid professional claim (837P structure).
//
// This agent answers: "Given these charges, what does the claim look like?"
//
// It pulls together: patient demographics, provider NPI, coverage/eligibility,
// coded charges (from Coding Optimization), place of service, and prior auth
// if applicable. It does NOT code — that's already done. It does NOT scrub —
// that's the next agent.
//
// Layer 3 state transition: (coded) → draft
// Layer 4 events: subscribes coding.recommended, emits claim.created
// ---------------------------------------------------------------------------

const input = z.object({
  encounterId: z.string(),
  patientId: z.string(),
  organizationId: z.string(),
});

const output = z.object({
  claimId: z.string().nullable(),
  claimNumber: z.string().nullable(),
  lineCount: z.number(),
  totalBilledCents: z.number(),
  blocked: z.boolean(),
  blockReason: z.string().nullable(),
});

export const claimConstructionAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: "claimConstruction",
  version: "1.0.0",
  description:
    "Assembles coded charges into a valid professional claim. Pulls together " +
    "patient, provider, coverage, and charge data into a single claim object " +
    "ready for scrubbing.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: [
    "read.patient",
    "read.encounter",
    "read.claim",
    "write.claim.scrub",
  ],
  requiresApproval: false,

  async run({ encounterId, patientId, organizationId }, ctx) {
    const trace = startReasoning("claimConstruction", "1.0.0", ctx.jobId);
    trace.step("begin claim construction", { encounterId });

    ctx.assertCan("read.encounter");

    // ── Check if a claim already exists for this encounter ──────
    const existingClaim = await prisma.claim.findFirst({
      where: { encounterId, status: { notIn: ["voided", "written_off"] } },
    });
    if (existingClaim) {
      ctx.log("info", "Claim already exists for this encounter — skipping");
      trace.conclude({ confidence: 1.0, summary: "Skipped — claim already exists." });
      await trace.persist();
      return {
        claimId: existingClaim.id,
        claimNumber: existingClaim.claimNumber,
        lineCount: 0,
        totalBilledCents: existingClaim.billedAmountCents,
        blocked: false,
        blockReason: null,
      };
    }

    // ── Load encounter + patient + provider + coverage ──────────
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patient: true,
        provider: { include: { user: true } },
      },
    });
    if (!encounter) throw new Error(`Encounter ${encounterId} not found`);
    trace.step("loaded encounter", { modality: encounter.modality });

    // Load pending charges for this encounter
    const charges = await prisma.charge.findMany({
      where: { encounterId, status: "pending" },
      orderBy: { createdAt: "asc" },
    });
    trace.step("loaded charges", { count: charges.length });

    if (charges.length === 0) {
      ctx.log("warn", "No pending charges for this encounter — cannot construct claim");
      trace.conclude({ confidence: 0, summary: "No charges found." });
      await trace.persist();
      return {
        claimId: null,
        claimNumber: null,
        lineCount: 0,
        totalBilledCents: 0,
        blocked: true,
        blockReason: "No pending charges for this encounter",
      };
    }

    // Load ALL active coverages so we can detect a secondary payer and
    // order the COB chain. Claim construction only bills the primary in
    // V1 — secondary is emitted as a follow-up event so downstream can
    // file it after primary adjudicates.
    const coverages = await prisma.patientCoverage.findFirst({
      where: { patientId, active: true, type: "primary" },
    });
    const coverage = coverages;
    const secondaryCoverage = await prisma.patientCoverage.findFirst({
      where: { patientId, active: true, type: "secondary" },
    });
    trace.step("loaded coverage", {
      hasCoverage: !!coverage,
      payerName: coverage?.payerName ?? "none",
      hasSecondary: !!secondaryCoverage,
    });

    // ── Gating checks ───────────────────────────────────────────
    // Per Layer 5: will NOT create a claim if no active coverage
    if (!coverage) {
      ctx.log("warn", "No active primary coverage — blocking claim construction");
      await ctx.emit({
        name: "human.review.required",
        sourceAgent: "claimConstruction",
        category: "high_dollar",
        claimId: undefined,
        patientId,
        summary: `No active insurance coverage found for patient. Cannot construct claim for encounter ${encounterId}.`,
        suggestedAction: "Verify patient insurance and add coverage before billing.",
        tier: 1,
        organizationId,
      });
      trace.conclude({ confidence: 0, summary: "Blocked — no active coverage." });
      await trace.persist();
      return {
        claimId: null,
        claimNumber: null,
        lineCount: 0,
        totalBilledCents: 0,
        blocked: true,
        blockReason: "No active primary coverage",
      };
    }

    // ── Construct the claim ─────────────────────────────────────
    const serviceDate = encounter.completedAt ?? encounter.startedAt ?? encounter.createdAt;
    const totalBilledCents = charges.reduce((sum, c) => sum + c.feeAmountCents * c.units, 0);

    // Generate claim number: CLM-YYYYMMDD-<count>. Claim number must be
    // unique across the entire org so the 837P BHT03 value is never
    // reused. `count(*) + 1` is racy under concurrent encounter
    // finalization — two parallel runs can both read N and write N+1.
    // We retry with a suffix until the insert succeeds.
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const baseCount = await prisma.claim.count({ where: { organizationId } });
    let claimNumber = `CLM-${dateStr}-${String(baseCount + 1).padStart(4, "0")}`;

    // Determine POS
    const placeOfService =
      encounter.placeOfService ??
      (encounter.modality === "video" || encounter.modality === "phone"
        ? "02"
        : "11");

    // Build CPT and ICD-10 JSON arrays from charges. Preserve each charge's
    // linked diagnoses on the CPT entry so the 837P builder can emit real
    // SV107 pointers (which dx each line treats) instead of always pointing
    // at the first diagnosis. (EDI-2)
    const cptCodes = charges.map((c, i) => ({
      code: c.cptCode,
      label: c.cptDescription ?? c.cptCode,
      units: c.units,
      chargeAmount: c.feeAmountCents,
      modifiers: c.modifiers,
      sequence: i + 1,
      icd10Codes: c.icd10Codes,
    }));

    // Collect all unique ICD-10 codes from charges
    const allIcd10 = [...new Set(charges.flatMap((c) => c.icd10Codes))];
    const icd10Codes = allIcd10.map((code, i) => ({
      code,
      label: code, // TODO: lookup description from ICD-10 reference
      sequence: i + 1,
    }));

    // Resolve billing + rendering NPIs. If we can't find them, escalate
    // for operator review rather than construct a 10-digit-less claim
    // that the gateway will bounce (and charge us for).
    const { billingNpi, renderingNpi } = resolveBillingIdentifiers({
      providerBio: encounter.provider?.bio ?? null,
    });
    if (!billingNpi) {
      ctx.log("warn", "No billing NPI resolved — escalating", {
        providerId: encounter.providerId,
      });
      await ctx.emit({
        name: "human.review.required",
        sourceAgent: "claimConstruction",
        category: "coding_uncertainty",
        claimId: undefined,
        patientId,
        summary: `Cannot construct claim — no billing NPI on file for the rendering provider. See EMR-220.`,
        suggestedAction:
          "Add the provider's NPI to their profile (temporary path: embed 'NPI: 1234567890' in their bio) or set DEFAULT_BILLING_NPI in env.",
        tier: 1,
        organizationId,
      });
      trace.conclude({ confidence: 0, summary: "Blocked — no billing NPI." });
      await trace.persist();
      return {
        claimId: null,
        claimNumber: null,
        lineCount: 0,
        totalBilledCents: 0,
        blocked: true,
        blockReason: "No billing NPI on file",
      };
    }

    // Per-payer timely filing deadline — written up-front so the scrub +
    // monitor agents can enforce it without re-resolving the payer rule.
    const timelyFilingDeadline = computeTimelyFilingDeadline({
      serviceDate,
      payerId: coverage.payerId,
      payerName: coverage.payerName,
    });
    const payerRule = resolvePayerRule({
      payerId: coverage.payerId,
      payerName: coverage.payerName,
    });

    trace.step("assembled claim data", {
      totalBilledCents,
      lineCount: charges.length,
      placeOfService,
      icd10Count: allIcd10.length,
      timelyFilingDeadline: timelyFilingDeadline.toISOString(),
      payerRuleId: payerRule.id,
      billingNpi,
      renderingNpi,
    });

    // ── Persist the claim (with race-safe claim-number retry) ────
    ctx.assertCan("write.claim.scrub");

    let claim: Awaited<ReturnType<typeof prisma.claim.create>> | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        claim = await prisma.claim.create({
          data: {
            organizationId,
            patientId,
            encounterId,
            providerId: encounter.providerId,
            status: "draft",
            claimNumber,
            cptCodes: cptCodes as any,
            icd10Codes: icd10Codes as any,
            billedAmountCents: totalBilledCents,
            payerName: coverage.payerName,
            payerId: coverage.payerId,
            billingNpi,
            renderingNpi,
            placeOfService,
            frequencyCode: "1", // original claim
            serviceDate,
            timelyFilingDeadline,
          },
        });
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isUniqueErr = msg.includes("Unique constraint") || msg.includes("P2002");
        if (!isUniqueErr || attempt === 4) throw err;
        // Append an attempt suffix so the next try is unique. We keep
        // the human-readable prefix and just add a letter.
        claimNumber = `CLM-${dateStr}-${String(baseCount + 1 + attempt + 1).padStart(4, "0")}`;
        trace.step("claim-number collision — retrying", { attempt: attempt + 1, claimNumber });
      }
    }
    if (!claim) throw new Error("claim_construction: exhausted claim-number attempts");

    // Link charges to the claim
    await prisma.charge.updateMany({
      where: { id: { in: charges.map((c) => c.id) } },
      data: { claimId: claim.id, status: "claim_attached" },
    });

    // Emit claim.created → Claims Scrubbing Agent picks up
    await ctx.emit({
      name: "claim.created",
      claimId: claim.id,
      organizationId,
      patientId,
    });

    // If there's a secondary coverage, mark a follow-up so we bill it
    // after primary adjudicates. We intentionally do NOT construct the
    // secondary claim now — it needs the primary's 835 amounts in
    // Loop 2320 CAS segments.
    if (secondaryCoverage) {
      await ctx.emit({
        name: "human.review.required",
        sourceAgent: "claimConstruction",
        category: "novel_situation",
        claimId: claim.id,
        patientId,
        summary: `Patient has secondary coverage (${secondaryCoverage.payerName}). After primary adjudicates, file a secondary claim with Loop 2320 CAS carrying the primary's allowed/paid/adjustment amounts.`,
        suggestedAction:
          "Wait for primary ERA, then construct secondary claim referencing adjusted amounts.",
        tier: 1,
        organizationId,
      });
      trace.step("secondary coverage present — queued follow-up", {
        secondaryPayer: secondaryCoverage.payerName,
      });
    }

    await writeAgentAudit(
      "claimConstruction",
      "1.0.0",
      organizationId,
      "claim.constructed",
      { type: "Claim", id: claim.id },
      {
        claimNumber,
        lineCount: charges.length,
        totalBilledCents,
        payerName: coverage.payerName,
      },
    );

    trace.conclude({
      confidence: 0.9,
      summary: `Constructed claim ${claimNumber} with ${charges.length} line(s) totaling $${(totalBilledCents / 100).toFixed(2)} for ${coverage.payerName}.`,
    });
    await trace.persist();

    ctx.log("info", "Claim constructed", {
      claimId: claim.id,
      claimNumber,
      lineCount: charges.length,
      totalBilledCents,
    });

    return {
      claimId: claim.id,
      claimNumber,
      lineCount: charges.length,
      totalBilledCents,
      blocked: false,
      blockReason: null,
    };
  },
};
