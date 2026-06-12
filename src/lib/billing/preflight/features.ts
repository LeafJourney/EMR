/**
 * Denial-probability feature extraction (EMR-1137 / EMR-1138, epic EMR-1120)
 * --------------------------------------------------------------------------
 * Phase 2 of the RCM red-text spec: transform a claim + its encounter
 * context into the deterministic feature vector consumed by
 * `computePDenial` (score.ts).
 *
 * Features (names follow the spec's math notation):
 *   xCci        — binary NCCI / unbundling violation that no modifier can
 *                 fix. Reuses `scrubClaim` (src/lib/billing/scrub.ts) plus
 *                 the pre-flight NCCI seed table so both engines agree.
 *   modifierGap — binary: a bundled pair IS modifier-fixable (e.g. 99214 +
 *                 96372 needs Modifier-25) but the modifier is missing.
 *                 The spec's "modifier array configuration" feature.
 *   vPayer      — payer-specific historical denial rate for the claim's
 *                 CPTs over a rolling 180-day window. Computed from
 *                 historical outcome rows passed IN by the caller (feed it
 *                 Prisma query results); this module never touches the DB.
 *   deltaLcd    — LCD/NCD concordance distance: 0.0 = perfect CPT↔ICD
 *                 coverage-pair match with all required documentation
 *                 keywords present; → 1.0 as discordance grows.
 *   phiNarrative— semantic features from the narrative note: organ-system
 *                 count, MDM-severity keyword tier, Modifier-25
 *                 separate-service evidence, plus a composite [0,1] score.
 *
 * Everything here is pure and synchronous — no Prisma, no network, no LLM.
 */

import { scrubClaim, type ScrubInput } from "@/lib/billing/scrub";
import {
  PREFLIGHT_LCD_RULES,
  PREFLIGHT_NCCI_PAIRS,
  UNKNOWN_CPT_LCD_DELTA,
  type LcdCoverageRule,
  type NcciEditPair,
} from "./rules";

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

/** Same line shape used by ScrubInput and the 837P builder
 *  (src/lib/billing/edi/build-from-claim.ts) so callers can pass
 *  Claim.cptCodes JSON straight through. */
export interface PreflightServiceLine {
  code: string;
  label?: string;
  units?: number;
  chargeAmount?: number;
  modifiers?: string[];
}

export interface PreflightClaim {
  claimId?: string;
  payerName: string | null;
  payerId?: string | null;
  serviceDate: Date;
  serviceLines: PreflightServiceLine[];
  icd10Codes: Array<{ code: string; label?: string }>;
  selfPay?: boolean;
}

/** Encounter context — the DocumentReference side of the spec's
 *  ingestion core. */
export interface EncounterContext {
  /** Full narrative progress note text for the encounter. */
  narrativeNote: string;
  providerId?: string | null;
}

/** One historical adjudication outcome row. Designed so a caller can map
 *  Prisma Claim/AdjudicationResult query results directly into it —
 *  one row per (claim, CPT) outcome. */
export interface ClaimOutcomeRow {
  payerName: string;
  payerId?: string | null;
  cptCode: string;
  outcome: "paid" | "denied" | "partial";
  /** When the payer adjudicated (835 date). Drives the rolling window. */
  adjudicatedAt: Date;
}

export interface PreflightOptions {
  /** "Now" for the rolling payer-history window. Defaults to real time;
   *  pass a fixed date for deterministic runs/tests. */
  asOf?: Date;
  /** Historical claim outcomes (caller feeds Prisma results in). */
  payerHistory?: ClaimOutcomeRow[];
  /** Rolling window for vPayer, days. Default 180 per spec. */
  payerWindowDays?: number;
  /** Override / extend the seedable rules tables. */
  ncciPairs?: NcciEditPair[];
  lcdRules?: LcdCoverageRule[];
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface NcciHit extends NcciEditPair {
  source: "preflight_rules" | "scrub_engine";
}

export interface LcdLineResult {
  cptCode: string;
  /** 0.0 perfect coverage match → 1.0 fully discordant. */
  delta: number;
  ruleMatched: boolean;
  icdConcordant: boolean;
  missingKeywords: string[];
  description: string | null;
}

export interface PayerHistoryResult {
  /** Smoothed denial rate in [0,1] for the worst CPT on the claim. */
  rate: number;
  /** Raw in-window row count behind that rate (0 = prior only). */
  sampleSize: number;
  worstCpt: string | null;
  perCpt: Array<{ cptCode: string; denied: number; total: number; rate: number }>;
}

export interface NarrativeFeatures {
  /** Distinct organ systems referenced in the note (capped scoring at 5). */
  organSystemCount: number;
  /** MDM severity keyword tier: 0 none, 1 low, 2 moderate, 3 high. */
  mdmTier: 0 | 1 | 2 | 3;
  /** Note explicitly documents a separate, distinct service (Mod-25 evidence). */
  mod25Evidence: boolean;
  wordCount: number;
  /** Composite documentation-quality score in [0,1]. */
  score: number;
}

export interface PreflightFeatures {
  xCci: 0 | 1;
  modifierGap: 0 | 1;
  vPayer: number;
  deltaLcd: number;
  phiNarrative: NarrativeFeatures;
  details: {
    unbundlingHits: NcciHit[];
    modifierGapHits: NcciHit[];
    lcdLines: LcdLineResult[];
    payerHistory: PayerHistoryResult;
  };
}

// ---------------------------------------------------------------------------
// phiNarrative — semantic features from the clinical note
// ---------------------------------------------------------------------------

const ORGAN_SYSTEM_KEYWORDS: Record<string, string[]> = {
  constitutional: ["fatigue", "fever", "chills", "weight loss", "weight gain", "malaise", "night sweats"],
  cardiovascular: ["chest pain", "palpitation", "blood pressure", "hypertension", "edema", "cardiovascular"],
  respiratory: ["shortness of breath", "dyspnea", "cough", "wheez", "respiratory"],
  gastrointestinal: ["nausea", "vomit", "abdominal", "diarrhea", "constipation", "appetite"],
  musculoskeletal: ["back pain", "joint", "muscle", "musculoskeletal", "range of motion", "gait"],
  neurological: ["headache", "dizziness", "numbness", "tingling", "seizure", "tremor", "neurolog"],
  psychiatric: ["anxiety", "depress", "mood", "insomnia", "panic", "psychiatric", "ptsd", "sleep"],
  integumentary: ["rash", "lesion", "skin", "pruritus", "wound"],
  heent: ["vision", "blurred", "hearing", "tinnitus", "sore throat", "sinus"],
  endocrine_gu: ["urinary", "thyroid", "glucose", "polyuria", "endocrine"],
};

const MDM_HIGH_KEYWORDS = [
  "high risk",
  "severe exacerbation",
  "hospitalization",
  "emergency",
  "life-threatening",
  "progressive neurological",
  "red flag",
];

const MDM_MODERATE_KEYWORDS = [
  "worsening",
  "uncontrolled",
  "new problem",
  "medication adjusted",
  "dose increased",
  "dose adjusted",
  "titrat",
  "prescription drug management",
  "treatment plan adjusted",
  "side effect",
];

const MDM_LOW_KEYWORDS = ["stable", "improving", "well controlled", "refill", "continue current"];

const MOD25_EVIDENCE_PHRASES = [
  "separately identifiable",
  "separate evaluation",
  "separate and distinct",
  "distinct service",
  "in addition to",
  "unrelated to the",
  "separate e/m",
  "separate assessment",
];

const ORGAN_SYSTEM_CAP = 5;
const ADEQUATE_NOTE_WORDS = 120;

export function extractNarrativeFeatures(narrative: string): NarrativeFeatures {
  const text = (narrative ?? "").toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  let organSystemCount = 0;
  for (const keywords of Object.values(ORGAN_SYSTEM_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k))) organSystemCount++;
  }

  let mdmTier: 0 | 1 | 2 | 3 = 0;
  if (MDM_HIGH_KEYWORDS.some((k) => text.includes(k))) mdmTier = 3;
  else if (MDM_MODERATE_KEYWORDS.some((k) => text.includes(k))) mdmTier = 2;
  else if (MDM_LOW_KEYWORDS.some((k) => text.includes(k))) mdmTier = 1;

  const mod25Evidence = MOD25_EVIDENCE_PHRASES.some((p) => text.includes(p));

  // Composite documentation-quality score:
  //   40% breadth (organ systems, capped at 5)
  //   40% MDM severity tier
  //   20% length adequacy (120+ words = full credit)
  const score =
    0.4 * (Math.min(organSystemCount, ORGAN_SYSTEM_CAP) / ORGAN_SYSTEM_CAP) +
    0.4 * (mdmTier / 3) +
    0.2 * Math.min(wordCount / ADEQUATE_NOTE_WORDS, 1);

  return { organSystemCount, mdmTier, mod25Evidence, wordCount, score: round3(score) };
}

// ---------------------------------------------------------------------------
// vPayer — rolling 180-day payer × CPT denial rate
// ---------------------------------------------------------------------------

/** Industry-baseline prior so a payer/CPT with little history regresses
 *  toward a sane default instead of swinging to 0.0 or 1.0. */
export const PAYER_PRIOR_DENIAL_RATE = 0.08;
export const PAYER_PRIOR_WEIGHT = 5;
export const PAYER_WINDOW_DAYS = 180;

export function computePayerDenialHistory(args: {
  rows: ClaimOutcomeRow[];
  payerName: string | null;
  payerId?: string | null;
  cptCodes: string[];
  asOf: Date;
  windowDays?: number;
}): PayerHistoryResult {
  const windowDays = args.windowDays ?? PAYER_WINDOW_DAYS;
  const windowStart = args.asOf.getTime() - windowDays * 86_400_000;
  const payerNameLc = args.payerName?.trim().toLowerCase() ?? null;

  const inScope = args.rows.filter((row) => {
    const t = row.adjudicatedAt.getTime();
    if (t < windowStart || t > args.asOf.getTime()) return false;
    if (args.payerId && row.payerId) return row.payerId === args.payerId;
    if (payerNameLc) return row.payerName.trim().toLowerCase() === payerNameLc;
    return false;
  });

  const perCpt: PayerHistoryResult["perCpt"] = [];
  let worst: { cptCode: string; rate: number; total: number } | null = null;

  for (const cpt of new Set(args.cptCodes)) {
    const rows = inScope.filter((r) => r.cptCode === cpt);
    const denied = rows.filter((r) => r.outcome === "denied").length;
    const total = rows.length;
    // Laplace-style smoothing toward the industry prior.
    const rate =
      (denied + PAYER_PRIOR_DENIAL_RATE * PAYER_PRIOR_WEIGHT) / (total + PAYER_PRIOR_WEIGHT);
    perCpt.push({ cptCode: cpt, denied, total, rate: round3(rate) });
    if (!worst || rate > worst.rate) worst = { cptCode: cpt, rate, total };
  }

  return {
    rate: round3(worst?.rate ?? PAYER_PRIOR_DENIAL_RATE),
    sampleSize: worst?.total ?? 0,
    worstCpt: worst?.cptCode ?? null,
    perCpt,
  };
}

// ---------------------------------------------------------------------------
// deltaLcd — LCD/NCD concordance distance
// ---------------------------------------------------------------------------

export function computeLcdConcordance(
  lines: PreflightServiceLine[],
  icd10Codes: Array<{ code: string }>,
  narrative: string,
  rules: LcdCoverageRule[],
): { deltaLcd: number; lines: LcdLineResult[] } {
  const narrativeLc = (narrative ?? "").toLowerCase();
  const icdUpper = icd10Codes.map((i) => i.code.toUpperCase());

  const results: LcdLineResult[] = lines.map((line) => {
    const rule = rules.find((r) => r.cptCode === line.code);
    if (!rule) {
      return {
        cptCode: line.code,
        delta: UNKNOWN_CPT_LCD_DELTA,
        ruleMatched: false,
        icdConcordant: false,
        missingKeywords: [],
        description: null,
      };
    }
    const icdConcordant = icdUpper.some((icd) =>
      rule.approvedIcdPrefixes.some((p) => icd.startsWith(p.toUpperCase())),
    );
    const missingKeywords = rule.requiredDocKeywords.filter(
      (k) => !narrativeLc.includes(k.toLowerCase()),
    );
    // 50% of the distance is the coding pair itself; the other 50% is the
    // LCD's required documentation keywords.
    const icdComponent = icdConcordant ? 0 : 0.5;
    const keywordComponent =
      rule.requiredDocKeywords.length === 0
        ? 0
        : 0.5 * (missingKeywords.length / rule.requiredDocKeywords.length);
    return {
      cptCode: line.code,
      delta: round3(icdComponent + keywordComponent),
      ruleMatched: true,
      icdConcordant,
      missingKeywords,
      description: rule.description,
    };
  });

  return {
    deltaLcd: results.reduce((max, r) => Math.max(max, r.delta), 0),
    lines: results,
  };
}

// ---------------------------------------------------------------------------
// xCci / modifierGap — NCCI edits (seed table + scrubClaim reuse)
// ---------------------------------------------------------------------------

function detectNcci(
  claim: PreflightClaim,
  context: EncounterContext,
  pairs: NcciEditPair[],
): { unbundlingHits: NcciHit[]; modifierGapHits: NcciHit[] } {
  const codes = new Set(claim.serviceLines.map((l) => l.code));
  const unbundlingHits: NcciHit[] = [];
  const modifierGapHits: NcciHit[] = [];

  for (const pair of pairs) {
    if (!codes.has(pair.componentCode) || !codes.has(pair.comprehensiveCode)) continue;
    if (pair.allowedModifier == null) {
      unbundlingHits.push({ ...pair, source: "preflight_rules" });
      continue;
    }
    const comprehensiveLine = claim.serviceLines.find((l) => l.code === pair.comprehensiveCode);
    const hasModifier = (comprehensiveLine?.modifiers ?? []).includes(pair.allowedModifier);
    if (!hasModifier) modifierGapHits.push({ ...pair, source: "preflight_rules" });
  }

  // Reuse the existing scrub engine (NCCI_BUNDLED_PAIR rule) so pairs it
  // knows about (counseling bundles, payer quirks like UHC ignoring
  // mod-25 on Z71 counseling) feed the same features. Other scrub rules
  // (timely filing, eligibility, …) are intentionally ignored here.
  const scrubInput: ScrubInput = {
    cptCodes: claim.serviceLines.map((l) => ({
      code: l.code,
      label: l.label ?? l.code,
      units: l.units,
      chargeAmount: l.chargeAmount,
      modifiers: l.modifiers,
    })),
    icd10Codes: claim.icd10Codes,
    payerName: claim.payerName,
    payerId: claim.payerId,
    serviceDate: claim.serviceDate,
    providerId: context.providerId ?? "preflight",
    selfPay: claim.selfPay,
  };
  const seen = new Set(
    [...unbundlingHits, ...modifierGapHits].map((h) => h.componentCode),
  );
  for (const issue of scrubClaim(scrubInput)) {
    if (issue.ruleCode !== "NCCI_BUNDLED_PAIR") continue;
    const componentCode = issue.relatedCode ?? "";
    if (!componentCode || seen.has(componentCode)) continue;
    seen.add(componentCode);
    const comprehensiveCode = /billed with (\S+)/.exec(issue.message)?.[1] ?? "";
    const hit: NcciHit = {
      componentCode,
      comprehensiveCode,
      allowedModifier: issue.blocksSubmission ? null : "25",
      description: issue.message,
      source: "scrub_engine",
    };
    if (issue.blocksSubmission) unbundlingHits.push(hit);
    else modifierGapHits.push(hit);
  }

  return { unbundlingHits, modifierGapHits };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function extractFeatures(
  claim: PreflightClaim,
  context: EncounterContext,
  options: PreflightOptions = {},
): PreflightFeatures {
  const phiNarrative = extractNarrativeFeatures(context.narrativeNote);

  const { unbundlingHits, modifierGapHits } = detectNcci(
    claim,
    context,
    options.ncciPairs ?? PREFLIGHT_NCCI_PAIRS,
  );

  const payerHistory = computePayerDenialHistory({
    rows: options.payerHistory ?? [],
    payerName: claim.payerName,
    payerId: claim.payerId,
    cptCodes: claim.serviceLines.map((l) => l.code),
    asOf: options.asOf ?? new Date(),
    windowDays: options.payerWindowDays,
  });

  const lcd = computeLcdConcordance(
    claim.serviceLines,
    claim.icd10Codes,
    context.narrativeNote,
    options.lcdRules ?? PREFLIGHT_LCD_RULES,
  );

  return {
    xCci: unbundlingHits.length > 0 ? 1 : 0,
    modifierGap: modifierGapHits.length > 0 ? 1 : 0,
    vPayer: payerHistory.rate,
    deltaLcd: lcd.deltaLcd,
    phiNarrative,
    details: {
      unbundlingHits,
      modifierGapHits,
      lcdLines: lcd.lines,
      payerHistory,
    },
  };
}

// ---------------------------------------------------------------------------

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
