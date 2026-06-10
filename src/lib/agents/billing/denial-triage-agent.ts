import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { assertOrgMatch } from "@/lib/orchestration/guards";
import {
  classifyDenial,
  NEXT_ACTION_LABEL,
  type DenialCategory,
} from "@/lib/billing/denials";

// ---------------------------------------------------------------------------
// Cannabis-specific denial patterns
// ---------------------------------------------------------------------------
// Layered on top of the generic classifyDenial taxonomy. Real cannabis
// denials have distinct resolution paths vs. the generic ones — e.g. an
// F12.x "medical necessity" denial needs psych eval + prior-treatment
// failure docs, not the generic "attach clinical notes" response.
//
// detectCannabisDenialPattern is exported so tests can exercise the matrix
// without a DB. Pattern ids follow the convention
//   <primary-icd10>-<denial-flavor>
// and surface in task titles with a 🌿 marker.

export type CannabisDenialPatternId =
  | "f12-medical-necessity"
  | "z7189-bundling"
  | "cannabis-not-covered-policy"
  | "prior-auth-cannabis";

export interface CannabisDenialPattern {
  id: CannabisDenialPatternId;
  label: string;
  /** What to put in the task title after the 🌿 marker */
  titleTag: string;
  urgency: "high" | "medium" | "low";
  suggestedAction:
    | "submit_appeal"
    | "update_coding"
    | "transfer_to_patient"
    | "obtain_authorization"
    | "write_off";
  /** Plain-language description shown to billers */
  description: string;
  /** What docs/steps are needed to resolve */
  resolutionPlaybook: string[];
}

const CANNABIS_DENIAL_PATTERNS: Record<CannabisDenialPatternId, CannabisDenialPattern> = {
  "f12-medical-necessity": {
    id: "f12-medical-necessity",
    label: "F12.x medical-necessity denial",
    titleTag: "F12 medical necessity",
    urgency: "high",
    suggestedAction: "submit_appeal",
    description:
      "Cannabis use disorder diagnosis (F12.x) was denied for medical necessity (CO-50). Generic 'attach notes' won't work — the payer needs DSM-5 severity, documented prior-treatment failures, and payer-specific coverage language.",
    resolutionPlaybook: [
      "Pull payer-specific cannabis / SUD coverage policy and cite it by number",
      "Attach psychiatric eval confirming DSM-5 criteria count + severity",
      "Document prior treatment failures (CBT, MI, pharmacotherapy) with dates",
      "Route to psychiatry for co-signature if available",
    ],
  },
  "z7189-bundling": {
    id: "z7189-bundling",
    label: "Z71.89 counseling bundling",
    titleTag: "Z71.89 bundling",
    urgency: "medium",
    suggestedAction: "update_coding",
    description:
      "Counseling code (Z71.89) denied as bundled (CO-97). Two sub-cases: (a) modifier 25 was missing and is fixable, or (b) this payer does not honor modifier 25 on Z71.89 and the line must be written off.",
    resolutionPlaybook: [
      "Check EOB language — does it say 'incidental' (no fix) or 'bundled without modifier' (fixable)",
      "If fixable: add modifier 25 to the E/M + re-verify MDM justifies the separate service, then resubmit",
      "If payer-wide policy: escalate for write-off decision, do not re-bill",
    ],
  },
  "cannabis-not-covered-policy": {
    id: "cannabis-not-covered-policy",
    label: "Cannabis exclusion policy",
    titleTag: "Cannabis non-covered",
    urgency: "low",
    suggestedAction: "transfer_to_patient",
    description:
      "F12/Z71 line item hit a benefit exclusion. An appeal will burn timely-filing without a meaningful chance of overturn — the payer's policy excludes cannabis-related services.",
    resolutionPlaybook: [
      "DO NOT APPEAL — appeal burns the timely-filing window with near-zero chance of success.",
      "Convert line to self-pay using the practice's published rate",
      "Offer payment plan if amount >$150",
      "Issue written ABN for the next visit if this payer is likely to deny again",
    ],
  },
  "prior-auth-cannabis": {
    id: "prior-auth-cannabis",
    label: "Cannabis PA required",
    titleTag: "Cannabis PA",
    urgency: "high",
    suggestedAction: "obtain_authorization",
    description:
      "F12/Z71 line denied because prior authorization is required for cannabis services. Either retrieve an existing PA number or submit a new PA packet.",
    resolutionPlaybook: [
      "Search PA tracker for an existing number on this plan",
      "If none: assemble PA packet (DSM-5 dx, prior failures, treatment plan) and submit via payer portal",
      "Flag clinician: future cannabis visits for this plan require PA before service",
    ],
  },
};

function extractCarcCodes(denialReason: string | null | undefined): string[] {
  if (!denialReason) return [];
  const codes = new Set<string>();
  // Match both "CO-50", "PR 50", "CARC 50" etc.
  const regex = /(?:carc\s*|co-|co\s+|pr-|pr\s+|oa-|oa\s+|pi-|pi\s+)(\d{1,3})/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(denialReason)) !== null) {
    codes.add(m[1]);
  }
  return Array.from(codes);
}

export function detectCannabisDenialPattern(args: {
  icd10Codes: string[];
  cptCodes: string[];
  denialReason: string | null | undefined;
}): CannabisDenialPattern | null {
  const text = (args.denialReason ?? "").toLowerCase();
  const carcCodes = extractCarcCodes(args.denialReason);
  const hasF12 = args.icd10Codes.some((c) => c.startsWith("F12"));
  const hasZ71 = args.icd10Codes.some((c) => c.startsWith("Z71"));
  const hasCannabisDx = hasF12 || hasZ71;
  if (!hasCannabisDx) return null;

  // Pattern 3: benefit-exclusion — check before appeal-path patterns so we
  // don't accidentally burn timely filing.
  const isExclusion =
    text.includes("not covered") ||
    text.includes("non-covered") ||
    text.includes("exclusion") ||
    text.includes("benefit exclusion");
  if (isExclusion) return CANNABIS_DENIAL_PATTERNS["cannabis-not-covered-policy"];

  // Pattern 4: PA required
  const paRequired =
    text.includes("prior auth") ||
    text.includes("no authorization") ||
    text.includes("authorization required") ||
    carcCodes.includes("197");
  if (paRequired) return CANNABIS_DENIAL_PATTERNS["prior-auth-cannabis"];

  // Pattern 1: F12 medical necessity (CO-50)
  if (
    hasF12 &&
    (carcCodes.includes("50") ||
      text.includes("medical necessity") ||
      text.includes("not medically necessary"))
  ) {
    return CANNABIS_DENIAL_PATTERNS["f12-medical-necessity"];
  }

  // Pattern 2: Z71.89 bundling (CO-97)
  if (
    args.icd10Codes.some((c) => c.startsWith("Z71.89")) &&
    (carcCodes.includes("97") ||
      text.includes("bundled") ||
      text.includes("incidental") ||
      text.includes("included in another"))
  ) {
    return CANNABIS_DENIAL_PATTERNS["z7189-bundling"];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Pure helpers (extracted for testing)
// ---------------------------------------------------------------------------

/** Map a denial urgency to the number of days a follow-up task is given
 * before it's due. Pure so callers can reuse and tests can verify. */
export function dueDaysForUrgency(urgency: "high" | "medium" | "low"): number {
  if (urgency === "high") return 2;
  if (urgency === "medium") return 5;
  return 10;
}

/** Claim statuses that are eligible for denial triage. The agent is a no-op
 * for anything else — tracking it here so the guard is testable. */
export const TRIAGE_ELIGIBLE_STATUSES = ["denied", "appealed"] as const;

export function isTriageEligible(claimStatus: string): boolean {
  return (TRIAGE_ELIGIBLE_STATUSES as readonly string[]).includes(claimStatus);
}

/** Shape returned by classifyDenial + a derived due date, in one call —
 * useful for callers that want the full triage packet. */
export function buildDenialTriagePlan(
  denialReason: string | null | undefined,
  now: Date = new Date(),
): {
  category: DenialCategory;
  label: string;
  suggestedAction: string;
  urgency: "high" | "medium" | "low";
  description: string;
  dueDays: number;
  dueAt: Date;
} {
  const entry = classifyDenial(denialReason);
  const dueDays = dueDaysForUrgency(entry.urgency);
  const dueAt = new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000);
  return {
    category: entry.category,
    label: entry.label,
    suggestedAction: entry.suggestedAction,
    urgency: entry.urgency,
    description: entry.description,
    dueDays,
    dueAt,
  };
}

// ---------------------------------------------------------------------------
// Denial Triage Agent
// ---------------------------------------------------------------------------
// Per PRD §13.2 #7: "Turn denials into structured next actions."
//
// Fires on claim.denied events. Classifies the denial reason against the
// taxonomy, persists the triage to claim.denialTriage, and creates a
// follow-up Task assigned to the billing role with the suggested next
// action and urgency.
// ---------------------------------------------------------------------------

const input = z.object({ claimId: z.string() });

const output = z.union([
  z.object({
    claimId: z.string(),
    category: z.string(),
    suggestedAction: z.string(),
    urgency: z.string(),
    taskId: z.string().nullable(),
  }),
  z.object({
    triaged: z.literal(false),
    reason: z.string(),
  }),
]);

export const denialTriageAgent: Agent<z.infer<typeof input>, z.infer<typeof output>> = {
  name: "denialTriage",
  version: "1.0.0",
  description:
    "Classifies a denied claim into a category, suggests the next action, " +
    "and creates a follow-up task for the billing team.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.claim", "write.denial.triage", "write.task"],
  // Classifies denials and creates the tasks that drive downstream appeal or
  // write-off decisions. A misclassification routes real revenue to the wrong
  // next action (e.g. writing off an appealable denial), so a human must
  // confirm the category before the task fans out.
  requiresApproval: true,

  async run({ claimId }, ctx) {
    ctx.assertCan("read.claim");
    ctx.log("info", "Triaging denial", { claimId });

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: { patient: { select: { firstName: true, lastName: true } } },
    });

    if (!claim) {
      ctx.log("info", "Claim not found — skipping", { claimId });
      return { triaged: false as const, reason: "claim_not_found" };
    }

    // Security invariant: every downstream write (Task, FinancialEvent) is
    // scoped to claim.organizationId. Before we trust that value, assert it
    // matches the org the job was invoked under — otherwise a malicious or
    // buggy dispatch could drive writes into a different tenant's queue.
    //
    // ctx.organizationId may be null for unscoped runs; denialTriage only
    // makes sense in an org scope, so refuse null too.
    if (ctx.organizationId == null) {
      ctx.log("warn", "Org scope missing — refusing to triage", {
        claimId,
        claimOrg: claim.organizationId,
      });
      throw new Error(
        `Org scope violation: denialTriage invoked without an organizationId ` +
          `on job context; claim ${claimId} belongs to org ${claim.organizationId}.`,
      );
    }
    assertOrgMatch(claim.organizationId, ctx.organizationId, "claim", claim.id);

    if (!isTriageEligible(claim.status)) {
      ctx.log("warn", "Claim is not in denied state — skipping triage", {
        status: claim.status,
      });
      return {
        claimId,
        category: "skipped",
        suggestedAction: "none",
        urgency: "low",
        taskId: null,
      };
    }

    const baseTriage = classifyDenial(claim.denialReason);

    // Cannabis-specific pattern overlay. Uses the claim's actual ICD-10 +
    // CPT codes to decide whether a more targeted resolution path applies.
    const rawIcd = Array.isArray(claim.icd10Codes) ? claim.icd10Codes : [];
    const icd10Codes = rawIcd
      .map((c: any) => (typeof c === "string" ? c : c?.code))
      .filter((c): c is string => typeof c === "string");
    const rawCpt = Array.isArray(claim.cptCodes) ? claim.cptCodes : [];
    const cptCodes = rawCpt
      .map((c: any) => (typeof c === "string" ? c : c?.code))
      .filter((c): c is string => typeof c === "string");

    const cannabisPattern = detectCannabisDenialPattern({
      icd10Codes,
      cptCodes,
      denialReason: claim.denialReason,
    });

    const triage = cannabisPattern
      ? {
          ...baseTriage,
          urgency: cannabisPattern.urgency,
          suggestedAction: cannabisPattern.suggestedAction,
          label: `${baseTriage.label} — ${cannabisPattern.label}`,
          description: `${cannabisPattern.description}\n\nResolution playbook:\n  - ${cannabisPattern.resolutionPlaybook.join("\n  - ")}`,
        }
      : baseTriage;

    ctx.assertCan("write.denial.triage");

    await prisma.claim.update({
      where: { id: claimId },
      data: {
        denialTriage: {
          category: triage.category,
          label: triage.label,
          suggestedAction: triage.suggestedAction,
          urgency: triage.urgency,
          description: triage.description,
          cannabisPatternId: cannabisPattern?.id ?? null,
        } as any,
        triagedAt: new Date(),
      },
    });

    // Create a billing task with the suggested next action
    ctx.assertCan("write.task");

    const dueDays = dueDaysForUrgency(triage.urgency);
    const titlePrefix = cannabisPattern
      ? `\u{1F33F} ${cannabisPattern.titleTag} [${cannabisPattern.id}]: `
      : `${triage.label}: `;
    const task = await prisma.task.create({
      data: {
        patientId: claim.patientId,
        organizationId: claim.organizationId,
        title: `${titlePrefix}${claim.patient.firstName} ${claim.patient.lastName}`,
        description: `${triage.description}\n\nSuggested action: ${NEXT_ACTION_LABEL[triage.suggestedAction]}\n\nClaim: ${claim.claimNumber} — ${claim.payerName ?? "Unknown payer"}\n\nPayer message: "${claim.denialReason ?? "no reason given"}"\n\n[Created by denialTriage agent${cannabisPattern ? ` — cannabis pattern: ${cannabisPattern.id}` : ""}]`,
        status: "open",
        kind: "billing_followup",
        assigneeRole: "operator",
        dueAt: new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000),
      },
    });

    // Audit
    await prisma.financialEvent.create({
      data: {
        organizationId: claim.organizationId,
        patientId: claim.patientId,
        claimId: claim.id,
        type: "claim_denied",
        amountCents: 0,
        description: `Denial triaged → ${triage.label} (${triage.urgency} urgency)`,
        metadata: {
          category: triage.category,
          suggestedAction: triage.suggestedAction,
          taskId: task.id,
        },
        createdByAgent: "denialTriage:1.0.0",
      },
    });

    ctx.log("info", "Denial triage complete", {
      category: triage.category,
      taskId: task.id,
    });

    return {
      claimId,
      category: triage.category,
      suggestedAction: triage.suggestedAction,
      urgency: triage.urgency,
      taskId: task.id,
    };
  },
};
