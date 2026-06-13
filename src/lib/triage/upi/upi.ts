// UPI — Urgency Priority Index scoring core (EMR-1146 / EMR-1147).
//
// Phase 3 of the red-text spec: converts extracted clinical concepts and
// sentiment metrics into a single deterministic metric:
//
//   UPI = w1 · A_esi + w2 · S_distress + w3 · V_patient,  clamped to [0, 1]
//
// with weights calibrated to prioritize physical clinical indicators over
// emotional expression (w1 = 0.65, w2 = 0.15, w3 = 0.20).
//
// Safety floor: an active first-party ESI-1 red-flag entity (acuity ≥ 0.9)
// floors the score at RED_FLAG_FLOOR regardless of distress/vulnerability,
// so "crushing chest pain" stated calmly still routes urgent. This is the
// direct fix for the EMR-1090 under-escalation incident, and the floor is
// reported in the factor breakdown for clinician transparency.

import type { DistressSignal } from "./distress";
import type { EntityExtractionResult, ExtractedEntity } from "./entities";

export interface UpiWeights {
  acuity: number;
  distress: number;
  vulnerability: number;
}

export const DEFAULT_WEIGHTS: UpiWeights = {
  acuity: 0.65,
  distress: 0.15,
  vulnerability: 0.2,
};

/** Route-urgent threshold (spec Phase 4.1: UPI ≥ 0.75). */
export const URGENT_THRESHOLD = 0.75;

/** Active entities at or above this acuity are ESI-1 red flags. */
export const RED_FLAG_ACUITY = 0.9;

/** Minimum UPI when an active red-flag entity is present. */
export const RED_FLAG_FLOOR = 0.85;

// ── Vulnerability (V_patient) ──────────────────────────────────────────

/**
 * Chart-context vulnerability flags (spec Phase 3): severe cardiovascular
 * disease, advanced metabolic instability, or an active 30-day
 * post-operative recovery window.
 */
export interface VulnerabilityFlags {
  severeCardiovascularDisease?: boolean;
  advancedMetabolicInstability?: boolean;
  postOpWithin30Days?: boolean;
}

const VULNERABILITY_CONTRIBUTIONS: ReadonlyArray<{
  key: keyof VulnerabilityFlags;
  label: string;
  value: number;
}> = [
  { key: "severeCardiovascularDisease", label: "Severe cardiovascular disease", value: 0.8 },
  { key: "advancedMetabolicInstability", label: "Advanced metabolic instability", value: 0.7 },
  { key: "postOpWithin30Days", label: "Within 30-day post-op window", value: 0.7 },
];

/** V_patient in [0, 1] from chart-context flags. No flags → 0. */
export function vulnerabilityScore(flags: VulnerabilityFlags | undefined): number {
  if (!flags) return 0;
  let v = 0;
  for (const c of VULNERABILITY_CONTRIBUTIONS) {
    if (flags[c.key]) v += c.value;
  }
  return Math.min(1, v);
}

// ── Factor breakdown (clinician transparency) ──────────────────────────

export interface UpiFactorEntity {
  id: string;
  label: string;
  matched: string;
  acuity: number;
  acuityClass: string;
  negated: boolean;
  thirdParty: boolean;
}

export interface UpiFactors {
  acuity: {
    /** A_esi input. */
    value: number;
    weight: number;
    contribution: number;
    /** Every lexicon hit, including suppressed (negated/third-party) ones. */
    entities: UpiFactorEntity[];
    /** Hits excluded from scoring, with the reason visible via flags. */
    suppressedCount: number;
  };
  distress: {
    /** S_distress input. */
    value: number;
    weight: number;
    contribution: number;
    capsRatio: number;
    exclamationCount: number;
    panicTerms: string[];
  };
  vulnerability: {
    /** V_patient input. */
    value: number;
    weight: number;
    contribution: number;
    activeFlags: string[];
  };
  /** w1·A + w2·S + w3·V before the red-flag floor. */
  weightedSum: number;
  /** True when an active ESI-1 entity floored the score at RED_FLAG_FLOOR. */
  redFlagFloorApplied: boolean;
}

export interface UpiResult {
  /** Final UPI in [0, 1]. */
  score: number;
  factors: UpiFactors;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

function toFactorEntity(e: ExtractedEntity): UpiFactorEntity {
  return {
    id: e.id,
    label: e.label,
    matched: e.matched,
    acuity: e.acuity,
    acuityClass: e.acuityClass,
    negated: e.negated,
    thirdParty: e.thirdParty,
  };
}

/**
 * Compute the Urgency Priority Index. Pure and deterministic — the same
 * inputs always yield the same score, and the factor breakdown explains
 * every term of the weighted sum.
 */
export function computeUpi(input: {
  entities: EntityExtractionResult;
  distress: DistressSignal;
  vulnerability?: VulnerabilityFlags;
  weights?: UpiWeights;
}): UpiResult {
  const w = input.weights ?? DEFAULT_WEIGHTS;
  const aEsi = clamp01(input.entities.baseAcuity);
  const sDistress = clamp01(input.distress.score);
  const vPatient = vulnerabilityScore(input.vulnerability);

  const acuityContribution = w.acuity * aEsi;
  const distressContribution = w.distress * sDistress;
  const vulnerabilityContribution = w.vulnerability * vPatient;
  const weightedSum = clamp01(
    acuityContribution + distressContribution + vulnerabilityContribution,
  );

  const hasActiveRedFlag = input.entities.activeEntities.some(
    (e) => e.acuity >= RED_FLAG_ACUITY,
  );
  const redFlagFloorApplied = hasActiveRedFlag && weightedSum < RED_FLAG_FLOOR;
  const score = clamp01(redFlagFloorApplied ? RED_FLAG_FLOOR : weightedSum);

  const activeFlags = VULNERABILITY_CONTRIBUTIONS.filter(
    (c) => input.vulnerability?.[c.key],
  ).map((c) => c.label);

  return {
    score,
    factors: {
      acuity: {
        value: aEsi,
        weight: w.acuity,
        contribution: acuityContribution,
        entities: input.entities.entities.map(toFactorEntity),
        suppressedCount: input.entities.entities.filter(
          (e) => e.acuityClass !== "admin" && (e.negated || e.thirdParty),
        ).length,
      },
      distress: {
        value: sDistress,
        weight: w.distress,
        contribution: distressContribution,
        capsRatio: input.distress.capsRatio,
        exclamationCount: input.distress.exclamationCount,
        panicTerms: input.distress.panicTerms,
      },
      vulnerability: {
        value: vPatient,
        weight: w.vulnerability,
        contribution: vulnerabilityContribution,
        activeFlags,
      },
      weightedSum,
      redFlagFloorApplied,
    },
  };
}
