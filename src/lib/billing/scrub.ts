/**
 * Claim Scrub Engine — validates claims against payer + coding rules
 * BEFORE submission. Per the PRD section 12.3:
 *
 *   "A biller must be able to see exactly why a claim is being held.
 *    No cryptic nonsense. Plain language plus structured error detail."
 *
 * Each rule produces a ScrubIssue with severity, plain-language message,
 * and a suggested fix. This runs server-side and is deterministic — no
 * LLM, no network. The Claim Scrub Agent (future) wraps this engine and
 * adds confidence scoring + auto-fix for low-risk issues.
 */

import { resolvePayerRule } from "@/lib/billing/payer-rules";
import { loadNcciMueReference, type NcciMueReferenceData } from "@/lib/billing/ncci-mue";

export type ScrubSeverity = "error" | "warning" | "info";

export interface ScrubIssue {
  /** Stable rule code for filtering / metrics */
  ruleCode: string;
  severity: ScrubSeverity;
  /** Plain language — readable by a biller, not a computer */
  message: string;
  /** What to do about it */
  suggestion: string;
  /** Optional CPT or ICD-10 the issue relates to */
  relatedCode?: string;
  /** Whether the issue blocks submission */
  blocksSubmission: boolean;
  /** Suggested workflow action hint */
  workflowHint?: string;
}

export interface ScrubInput {
  cptCodes: Array<{
    code: string;
    label: string;
    units?: number;
    chargeAmount?: number;
    modifiers?: string[];
  }>;
  icd10Codes: Array<{ code: string; label?: string }>;
  payerName: string | null;
  payerId?: string | null;
  serviceDate: Date;
  providerId: string | null;
  modifierCodes?: string[];
  patientCoverage?: {
    eligibilityStatus: string;
    payerName: string;
  } | null;
  authRequired?: boolean;
  authNumber?: string | null;
  /** true when this is a corrected-claim resubmission (frequency 7/8) */
  corrected?: boolean;
  /** true when this claim is completely self-pay (uninsured or cash-only) */
  selfPay?: boolean;
}

// ---------------------------------------------------------------------------
// NCCI (procedure-to-procedure) edit pairs — in-code starter set
// ---------------------------------------------------------------------------
// CMS publishes quarterly NCCI tables; keeping a production-grade copy of
// tens of thousands of pairs in code is impractical. This starter set
// captures the highest-volume pairs for cannabis care (E/M + counseling
// bundling) so the scrub catches the most common errors even before the
// full CMS quarterly table is loaded.
//
// EMR-222: the full table lives in the `NcciEdit` / `MueLimit` tables
// (loaded from the CMS quarterly CSVs via `ncci-mue.ts`). `scrubClaim`
// accepts an injectable `ScrubReferenceData` so callers can run against the
// starter set (sync, zero-dependency) or against the merged starter + full
// CMS table (`scrubClaimWithReferenceData`, async, DB-backed). The starter
// set always wins on a pair it defines so the payer-specific semantics
// below (UnitedHealthcare mod-25, unbundleable phlebotomy) are preserved.

export interface NcciPair {
  /** The code that gets denied when billed with `comprehensiveCode` without a modifier. */
  componentCode: string;
  comprehensiveCode: string;
  /** Modifier that unbundles the pair (usually 25 or 59). null = never unbundleable. */
  allowedModifier: "25" | "59" | null;
  description: string;
}

const NCCI_PAIRS: NcciPair[] = [
  // Counseling codes bundled into same-day E/M
  { componentCode: "99406", comprehensiveCode: "99213", allowedModifier: "25", description: "Tobacco cessation counseling (3-10 min) bundles into 99213 without mod 25" },
  { componentCode: "99406", comprehensiveCode: "99214", allowedModifier: "25", description: "Tobacco cessation counseling bundles into 99214 without mod 25" },
  { componentCode: "99407", comprehensiveCode: "99214", allowedModifier: "25", description: "Tobacco cessation counseling (>10 min) bundles into 99214 without mod 25" },
  { componentCode: "99407", comprehensiveCode: "99215", allowedModifier: "25", description: "Tobacco cessation counseling bundles into 99215 without mod 25" },
  { componentCode: "96160", comprehensiveCode: "99213", allowedModifier: "25", description: "Health risk assessment bundles into same-day E/M without mod 25" },
  { componentCode: "96161", comprehensiveCode: "99213", allowedModifier: "25", description: "Caregiver health risk assessment bundles into same-day E/M without mod 25" },
  // Phlebotomy bundled into E/M when the lab is the reason for the visit
  { componentCode: "36415", comprehensiveCode: "99213", allowedModifier: null, description: "Venipuncture is incidental to an office visit and should not be separately billed." },
  { componentCode: "36415", comprehensiveCode: "99214", allowedModifier: null, description: "Venipuncture is incidental to an office visit and should not be separately billed." },
];

// ---------------------------------------------------------------------------
// MUE (Medically Unlikely Edit) per-day unit caps — starter set
// ---------------------------------------------------------------------------
// CMS publishes MUE limits per CPT per day. The full table is thousands of
// rows; here we keep the cannabis-care hot list.

const MUE_LIMITS: Record<string, number> = {
  "99202": 1, "99203": 1, "99204": 1, "99205": 1,
  "99211": 1, "99212": 1, "99213": 1, "99214": 1, "99215": 1,
  "99406": 4, "99407": 4,
  "96160": 2, "96161": 2,
  "36415": 3,
};

// ---------------------------------------------------------------------------
// Scrub reference data (EMR-222)
// ---------------------------------------------------------------------------
// The coding-edit rules (NCCI bundling + MUE unit caps) run against an
// injectable reference set. By default that's the in-code starter; the
// async path layers the full CMS quarterly table on top.

export interface ScrubReferenceData {
  ncciPairs: NcciPair[];
  mueLimits: Record<string, number>;
  /** CMS quarter the DB rows came from, e.g. "2026Q2"; null for starter-only. */
  quarter: string | null;
}

/** The starter-only reference used by the synchronous `scrubClaim`. */
export const DEFAULT_SCRUB_REFERENCE: ScrubReferenceData = {
  ncciPairs: NCCI_PAIRS,
  mueLimits: MUE_LIMITS,
  quarter: null,
};

/** Map a CMS PTP DB edit into the scrub engine's `NcciPair` shape.
 *  CMS convention: column-1 is the comprehensive (payable) code and
 *  column-2 is the component (bundled) code. `modifierIndicator`:
 *    0 → not unbundleable, 1 → a modifier (59/XU/…) may unbundle,
 *    9 → not applicable / deleted edit (skipped). */
function mapDbNcciToPairs(
  edits: NcciMueReferenceData["ncci"],
): NcciPair[] {
  return edits
    .filter((e) => e.modifierIndicator !== 9)
    .map((e) => ({
      componentCode: e.column2Code,
      comprehensiveCode: e.column1Code,
      allowedModifier: e.modifierIndicator === 1 ? ("59" as const) : null,
      description:
        e.modifierIndicator === 1
          ? `CMS NCCI PTP edit: ${e.column2Code} bundles into ${e.column1Code}; a distinct-service modifier (59/XU) may unbundle when clinically separate.`
          : `CMS NCCI PTP edit: ${e.column2Code} bundles into ${e.column1Code} and cannot be unbundled.`,
    }));
}

/** Merge the in-code starter set with the full CMS quarterly table.
 *  Starter NCCI pairs win on the (component, comprehensive) key so their
 *  payer-specific semantics survive; the DB MUE values are authoritative
 *  (they're the official CMS per-day caps) and override the starter. */
export function mergeScrubReferenceData(
  db: NcciMueReferenceData,
  starter: ScrubReferenceData = DEFAULT_SCRUB_REFERENCE,
): ScrubReferenceData {
  const seen = new Set(
    starter.ncciPairs.map((p) => `${p.componentCode}|${p.comprehensiveCode}`),
  );
  const ncciPairs = [...starter.ncciPairs];
  for (const p of mapDbNcciToPairs(db.ncci)) {
    const key = `${p.componentCode}|${p.comprehensiveCode}`;
    if (!seen.has(key)) {
      ncciPairs.push(p);
      seen.add(key);
    }
  }
  return {
    ncciPairs,
    mueLimits: { ...starter.mueLimits, ...db.mue },
    quarter: db.quarter,
  };
}

// ---------------------------------------------------------------------------
// Cannabis-friendly E&M codes for sanity checks
// ---------------------------------------------------------------------------

const VALID_EM_CODES = new Set([
  "99202", "99203", "99204", "99205", // new patient
  "99211", "99212", "99213", "99214", "99215", // established patient
  "99421", "99422", "99423", // online digital E&M
  "99441", "99442", "99443", // telephone visits
]);

const HIGH_LEVEL_EM = new Set(["99205", "99215"]);

const COUNSELING_CODES = new Set(["99401", "99402", "99403", "99404", "99406", "99407", "99411", "99412"]);

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function scrubClaim(
  input: ScrubInput,
  reference: ScrubReferenceData = DEFAULT_SCRUB_REFERENCE,
): ScrubIssue[] {
  const issues: ScrubIssue[] = [];
  const quarterTag = reference.quarter ? ` (CMS ${reference.quarter})` : "";

  // ── Rule: must have at least one CPT ──────────────────────────
  if (!input.cptCodes || input.cptCodes.length === 0) {
    issues.push({
      ruleCode: "MISSING_CPT",
      severity: "error",
      message: "This claim has no CPT or service code attached.",
      suggestion:
        "Add at least one billable service code from the encounter. Most cannabis follow-ups use 99213 or 99214.",
      blocksSubmission: true,
    });
  }

  // ── Rule: must have at least one ICD-10 ───────────────────────
  if (!input.icd10Codes || input.icd10Codes.length === 0) {
    issues.push({
      ruleCode: "MISSING_DIAGNOSIS",
      severity: "error",
      message:
        "No diagnosis code is linked to this visit. Payers require at least one ICD-10 to justify medical necessity.",
      suggestion:
        "Link a diagnosis from the visit note. Common cannabis-care codes: G89.29 (chronic pain), F41.1 (anxiety), G47.00 (insomnia), F32.9 (depression).",
      blocksSubmission: true,
    });
  }

  // ── Rule: payer required ──────────────────────────────────────
  if (!input.selfPay && !input.payerName) {
    issues.push({
      ruleCode: "MISSING_PAYER",
      severity: "error",
      message: "No payer assigned to this claim.",
      suggestion:
        "Either assign the patient's primary insurance or convert this to a self-pay claim.",
      blocksSubmission: true,
    });
  }

  // ── Rule: provider required ───────────────────────────────────
  if (!input.providerId) {
    issues.push({
      ruleCode: "MISSING_PROVIDER",
      severity: "error",
      message: "No rendering provider on this claim.",
      suggestion:
        "Set the rendering provider — usually the clinician who signed the encounter note.",
      blocksSubmission: true,
    });
  }

  // ── Rule: eligibility recently checked ────────────────────────
  if (
    !input.selfPay &&
    input.patientCoverage &&
    input.patientCoverage.eligibilityStatus !== "active"
  ) {
    issues.push({
      ruleCode: "ELIGIBILITY_NOT_ACTIVE",
      severity: "error",
      message: `Patient's primary insurance (${input.patientCoverage.payerName}) is not currently active.`,
      suggestion:
        "Re-verify eligibility before submitting. If coverage termed, transfer balance to patient responsibility.",
      blocksSubmission: true,
    });
  }

  // ── Rule: auth required but missing ──────────────────────────
  if (!input.selfPay && input.authRequired && !input.authNumber) {
    issues.push({
      ruleCode: "MISSING_PRIOR_AUTH",
      severity: "error",
      message:
        "This service requires prior authorization and no auth number is on file.",
      suggestion:
        "Contact the payer to obtain prior auth before submitting, or attach an existing auth number to this claim.",
      blocksSubmission: true,
    });
  }

  // ── Rule: high-level E&M needs documentation ─────────────────
  for (const cpt of input.cptCodes ?? []) {
    if (HIGH_LEVEL_EM.has(cpt.code)) {
      issues.push({
        ruleCode: "HIGH_LEVEL_EM_REVIEW",
        severity: "warning",
        message: `${cpt.code} is a high-level E&M code that requires substantial documentation.`,
        suggestion:
          "Confirm the visit note supports this level — typically 40-60 min total time or comprehensive history + exam + high-complexity decision making.",
        relatedCode: cpt.code,
        blocksSubmission: false,
      });
    }
  }

  // ── Rule: invalid E&M code ───────────────────────────────────
  for (const cpt of input.cptCodes ?? []) {
    // Only flag E&M-shaped codes (99xxx) that aren't on our valid list
    if (
      /^99\d{3}$/.test(cpt.code) &&
      !VALID_EM_CODES.has(cpt.code) &&
      !COUNSELING_CODES.has(cpt.code)
    ) {
      issues.push({
        ruleCode: "UNRECOGNIZED_EM_CODE",
        severity: "warning",
        message: `${cpt.code} doesn't match a standard outpatient E&M code.`,
        suggestion:
          "Double-check the code. If this is a valid less-common code, ignore this warning.",
        relatedCode: cpt.code,
        blocksSubmission: false,
      });
    }
  }

  // ── Rule: charge amount missing ──────────────────────────────
  for (const cpt of input.cptCodes ?? []) {
    if (cpt.chargeAmount == null || cpt.chargeAmount === 0) {
      issues.push({
        ruleCode: "MISSING_CHARGE_AMOUNT",
        severity: "warning",
        message: `${cpt.code} has no charge amount set.`,
        suggestion:
          "The fee schedule should populate this automatically. Check that the CPT exists in the practice fee schedule.",
        relatedCode: cpt.code,
        blocksSubmission: false,
      });
    }
  }

  // ── Rule: per-payer timely filing window ─────────────────────
  const payerRule = resolvePayerRule({
    payerId: input.payerId,
    payerName: input.payerName,
  });
  if (!input.selfPay) {
    const ageDays = Math.floor(
      (Date.now() - input.serviceDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const tfDays = input.corrected
      ? payerRule.correctedTimelyFilingDays
      : payerRule.timelyFilingDays;
    if (ageDays > tfDays) {
      issues.push({
        ruleCode: "PAST_TIMELY_FILING",
        severity: "error",
        message: `Service date is ${ageDays} days old. ${payerRule.displayName}'s timely filing window is ${tfDays} days.`,
        suggestion:
          "Past timely filing. If there's proof of timely intent (clearinghouse acceptance log, prior correspondence) appeal with documentation; otherwise write off.",
        blocksSubmission: true,
      });
    } else if (ageDays > tfDays * 0.8) {
      issues.push({
        ruleCode: "APPROACHING_TIMELY_FILING",
        severity: "warning",
        message: `Service date is ${ageDays} days old, approaching ${payerRule.displayName}'s ${tfDays}-day timely filing limit.`,
        suggestion: "Submit today. Once submitted, keep the clearinghouse acceptance record on file as proof of timely intent.",
        blocksSubmission: false,
      });
    }
  }

  // ── Rule: NCCI procedure-to-procedure edit pairs ─────────────
  const cptCodeSet = new Set(input.cptCodes.map((c) => c.code));
  for (const pair of reference.ncciPairs) {
    if (!cptCodeSet.has(pair.componentCode) || !cptCodeSet.has(pair.comprehensiveCode)) continue;
    const comprehensiveLine = input.cptCodes.find((c) => c.code === pair.comprehensiveCode);
    let hasAllowedModifier =
      pair.allowedModifier != null &&
      (comprehensiveLine?.modifiers ?? []).includes(pair.allowedModifier);
    
    // UnitedHealthcare ignores mod-25 on Z71 counseling
    if (
      pair.allowedModifier === "25" && 
      input.payerName === "UnitedHealthcare" && 
      pair.componentCode.startsWith("9940")
    ) {
      hasAllowedModifier = false;
    }

    if (!hasAllowedModifier) {
      issues.push({
        ruleCode: "NCCI_BUNDLED_PAIR",
        severity: pair.allowedModifier && input.payerName !== "UnitedHealthcare" ? "warning" : "error",
        message: `NCCI bundling: ${pair.componentCode} billed with ${pair.comprehensiveCode}. ${pair.description}${quarterTag}`,
        suggestion: pair.allowedModifier && input.payerName !== "UnitedHealthcare"
          ? `Attach modifier ${pair.allowedModifier} to ${pair.comprehensiveCode} if the service is truly separately identifiable, or drop the line.`
          : "Drop the component line — it is incidental to the comprehensive service.",
        relatedCode: pair.componentCode,
        blocksSubmission: !pair.allowedModifier || input.payerName === "UnitedHealthcare",
      });
    }
  }

  // ── Rule: MUE (Medically Unlikely Edits) per-day unit caps ───
  for (const cpt of input.cptCodes) {
    const limit = reference.mueLimits[cpt.code];
    if (limit != null && (cpt.units ?? 1) > limit) {
      issues.push({
        ruleCode: "MUE_EXCEEDED",
        severity: "error",
        message: `${cpt.code} billed ${cpt.units} units; MUE per-day limit is ${limit}.${quarterTag}`,
        suggestion:
          "Either reduce units, split onto separate dates of service, or append modifier 76/77/91 if the higher count is clinically justified.",
        relatedCode: cpt.code,
        blocksSubmission: true,
      });
    }
  }

  // ── Rule: cannabis coverage routing ──────────────────────────
  // If the payer excludes cannabis services and an F12/Z71 code is on
  // the claim, block submission up front — appealing a benefit-exclusion
  // burns the timely-filing window with no recovery.
  const hasCannabisDx = input.icd10Codes.some(
    (c) => c.code.startsWith("F12") || c.code.startsWith("Z71"),
  );
  if (!input.selfPay && hasCannabisDx && payerRule.excludesCannabis) {
    issues.push({
      ruleCode: "CANNABIS_PAYER_EXCLUDES",
      severity: "error",
      message: `${payerRule.displayName} excludes cannabis services per ${payerRule.cannabisPolicyCitation ?? "payer policy"}. Appealing is a dead end.`,
      suggestion:
        "Route this encounter to self-pay using the practice's published rate. Issue a written ABN for the next visit.",
      blocksSubmission: true,
      workflowHint: "route_to_self_pay",
    });
  }
  if (!input.selfPay && hasCannabisDx && payerRule.requiresPriorAuthForCannabis && !input.authNumber) {
    issues.push({
      ruleCode: "CANNABIS_PA_HOLD",
      severity: "error",
      message: `${payerRule.displayName} requires prior authorization for cannabis services and none is on file.`,
      suggestion:
        "Obtain PA before submission. PA packet should include DSM-5 severity, prior treatment failures, and a written treatment plan.",
      blocksSubmission: true,
      workflowHint: "create_pa_task",
    });
  }

  // ── Rule: cannabis-counseling-only without primary dx ────────
  const hasCounselingOnly = input.cptCodes?.every((c) =>
    c.code === "Z71.89" || COUNSELING_CODES.has(c.code),
  );
  const hasMedicalDx = input.icd10Codes?.some(
    (c) => !c.code.startsWith("Z71") && !c.code.startsWith("F12"),
  );
  if (hasCounselingOnly && !hasMedicalDx && (input.icd10Codes?.length ?? 0) > 0) {
    issues.push({
      ruleCode: "COUNSELING_NO_MEDICAL_DX",
      severity: "info",
      message:
        "Cannabis counseling claims typically need a medical diagnosis (e.g. chronic pain, anxiety) in addition to Z71.89.",
      suggestion:
        "Add the underlying condition being treated to support medical necessity.",
      blocksSubmission: false,
    });
  }

  return issues;
}

/**
 * DB-backed scrub (EMR-222). Loads the full CMS quarterly NCCI/MUE table,
 * merges it over the in-code starter set, and runs the same deterministic
 * rules. Resilient by design: if the reference table hasn't been loaded yet
 * (or the lookup fails) it falls back to the starter set so a claim is never
 * blocked from scrubbing — it just sees fewer coding edits.
 *
 * `loader` is injectable for tests; production uses the cached DB loader.
 */
export async function scrubClaimWithReferenceData(
  input: ScrubInput,
  loader: () => Promise<NcciMueReferenceData> = loadNcciMueReference,
): Promise<ScrubIssue[]> {
  const reference = await buildScrubReferenceData(loader);
  return scrubClaim(input, reference);
}

/** Build the merged starter + CMS-quarterly reference set. Falls back to the
 *  starter set when the DB table is unavailable. */
export async function buildScrubReferenceData(
  loader: () => Promise<NcciMueReferenceData> = loadNcciMueReference,
): Promise<ScrubReferenceData> {
  try {
    const db = await loader();
    return mergeScrubReferenceData(db);
  } catch {
    return DEFAULT_SCRUB_REFERENCE;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isClaimSubmittable(issues: ScrubIssue[]): boolean {
  return !issues.some((i) => i.blocksSubmission);
}

export function countBySeverity(issues: ScrubIssue[]): Record<ScrubSeverity, number> {
  return issues.reduce(
    (acc, i) => {
      acc[i.severity]++;
      return acc;
    },
    { error: 0, warning: 0, info: 0 } as Record<ScrubSeverity, number>,
  );
}
