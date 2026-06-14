// SAFE: dead-export-allowed reason="Ambient-CDS IR_risk engine (EMR-1127); consumed by the EMR-1128 inline-highlight UI + EMR-1130 FHIR layer, shipped engine-first per the rx-safety/preflight precedent"
// ---------------------------------------------------------------------------
// Wearable-Augmented Dynamic Insulin Resistance Risk Index (IR_risk)
// — spec Phase 3 (Linear EMR-1127, epic EMR-1118).
//
// Rather than a single static equation (HOMA-IR), the index fuses the
// biochemical anchor with continuous autonomic + glycemic telemetry. It is a
// deterministic logistic over engineered features, mirroring the established
// preflight denial model (src/lib/billing/preflight/score.ts): hand-calibrated
// named weights, per-feature contribution breakdown, [0,1] output.
//
//   z = b0 + w_homa·HOMA-IR + w_a1c·(HbA1c − 5.4)+
//          + w_cgm·σ̂_cgm + w_hrv·ΔĤRV
//   IR_risk = σ(z)
//
// where σ̂_cgm and ΔĤRV are the telemetry scalars normalized to [0,1].
// ---------------------------------------------------------------------------

import { normalizeTelemetry } from "./normalize";
import {
  BIOMARKER_FRESHNESS_WINDOW_DAYS,
  IR_RISK_WARN_THRESHOLD,
  type BiomarkerPanel,
  type IrRiskBand,
  type IrRiskFactor,
  type IrRiskFactorKey,
  type IrRiskResult,
  type NormalizedTelemetry,
  type WearableTelemetry,
} from "./types";

const DAY_MS = 86_400_000;

/**
 * Hand-calibrated logits. Replace with population-fit α/β coefficients once
 * the longitudinal metabolic dataset lands (spec Phase 3). Calibration anchors
 * (see __tests__/ir-risk.test.ts):
 *
 *   intercept −4.2 → a healthy panel (HOMA ~0.8, normal A1c, low CV) sits at
 *                    ~0.05: optimal, no tint.
 *   homaIr     1.15 → HOMA-IR ~3.1 alone (≈ +3.6 logits) is borderline ~0.54
 *                    on labs only — under the 0.65 line.
 *   hba1c      1.6  → each % above the 5.4% normal anchor amplifies.
 *   cgmVariability 1.4, hrvReduction 1.0 → the wearable augmentation that
 *                    tips that same borderline patient over 0.65. This is the
 *                    "wearable-augmented" thesis of the spec made concrete.
 */
export const IR_RISK_WEIGHTS = {
  intercept: -4.2,
  homaIr: 1.15,
  hba1c: 1.6,
  cgmVariability: 1.4,
  hrvReduction: 1.0,
} as const;

/** HbA1c at/below this (%) contributes nothing — non-diabetic normal anchor. */
const HBA1C_NORMAL_PCT = 5.4;
/** CGM CV at/below this (%) → 0 contribution. */
const CGM_CV_FLOOR_PCT = 15;
/** CGM CV at/above this (%) → full contribution (ADA variability target). */
const CGM_CV_CEIL_PCT = 36;
/** Nocturnal HRV drop at/above this (ms) → full contribution. */
const HRV_DROP_CEIL_MS = 40;

/** Band cutoffs over the continuous score. */
const SEVERE_THRESHOLD = 0.85;
const MODERATE_THRESHOLD = 0.35;

export function logistic(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** Homeostatic Model Assessment of Insulin Resistance. */
export function homaIr(glucoseMgDl: number, insulinUIuMl: number): number {
  return (glucoseMgDl * insulinUIuMl) / 405;
}

function bandFor(score: number): IrRiskBand {
  if (score >= SEVERE_THRESHOLD) return "severe";
  if (score >= IR_RISK_WARN_THRESHOLD) return "high";
  if (score >= MODERATE_THRESHOLD) return "moderate";
  return "optimal";
}

export interface IrRiskInput {
  biomarkers: BiomarkerPanel;
  /** Raw wearable streams; normalized internally via `normalizeTelemetry`. */
  telemetry?: WearableTelemetry;
  /** Pre-aligned telemetry — takes precedence over `telemetry` when set. */
  normalizedTelemetry?: NormalizedTelemetry;
}

/**
 * Compute IR_risk for a patient. Returns null when the mandatory fasting
 * panel (glucose + insulin) is absent — the engine never scores without its
 * biochemical anchor. HbA1c and wearable telemetry are optional amplifiers.
 *
 * @param now injectable clock for deterministic freshness + normalization.
 */
export function computeIrRisk(
  input: IrRiskInput,
  now: Date = new Date()
): IrRiskResult | null {
  const { fastingGlucoseMgDl, fastingInsulinUIuMl, hba1cPct, drawnAt } =
    input.biomarkers;
  if (!isPos(fastingGlucoseMgDl) || !isPos(fastingInsulinUIuMl)) return null;

  const homa = round4(homaIr(fastingGlucoseMgDl, fastingInsulinUIuMl));
  const norm =
    input.normalizedTelemetry ?? normalizeTelemetry(input.telemetry, now);

  const factors: IrRiskFactor[] = [];
  pushFactor(factors, "homaIr", homa, IR_RISK_WEIGHTS.homaIr, `HOMA-IR ${homa}`);

  if (Number.isFinite(hba1cPct)) {
    const excess = round4(Math.max(0, (hba1cPct as number) - HBA1C_NORMAL_PCT));
    pushFactor(
      factors,
      "hba1c",
      excess,
      IR_RISK_WEIGHTS.hba1c,
      `HbA1c ${hba1cPct}%`
    );
  }

  let wearableAugmented = false;
  if (norm.cgmVariabilityPct != null) {
    const v = round4(
      clamp01(
        (norm.cgmVariabilityPct - CGM_CV_FLOOR_PCT) /
          (CGM_CV_CEIL_PCT - CGM_CV_FLOOR_PCT)
      )
    );
    pushFactor(
      factors,
      "cgmVariability",
      v,
      IR_RISK_WEIGHTS.cgmVariability,
      `CGM variability ${round1(norm.cgmVariabilityPct)}% CV`
    );
    if (v > 0) wearableAugmented = true;
  }
  if (norm.hrvReductionMs != null) {
    const v = round4(clamp01(norm.hrvReductionMs / HRV_DROP_CEIL_MS));
    pushFactor(
      factors,
      "hrvReduction",
      v,
      IR_RISK_WEIGHTS.hrvReduction,
      `Nocturnal HRV −${round1(norm.hrvReductionMs)} ms`
    );
    if (v > 0) wearableAugmented = true;
  }

  factors.sort((a, b) => b.contribution - a.contribution);

  const z =
    IR_RISK_WEIGHTS.intercept +
    factors.reduce((sum, f) => sum + f.contribution, 0);
  const score = round4(logistic(z));

  return {
    score,
    band: bandFor(score),
    warn: score >= IR_RISK_WARN_THRESHOLD,
    homaIr: homa,
    factors,
    intercept: IR_RISK_WEIGHTS.intercept,
    lowConfidence: isStale(drawnAt, now),
    wearableAugmented,
    evaluatedAt: now.toISOString(),
  };
}

// ── helpers ──────────────────────────────────────────────────────────────

function isPos(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function isStale(drawnAt: string | Date | undefined, now: Date): boolean {
  if (!drawnAt) return false;
  const ms = drawnAt instanceof Date ? drawnAt.getTime() : new Date(drawnAt).getTime();
  if (!Number.isFinite(ms)) return false;
  return now.getTime() - ms > BIOMARKER_FRESHNESS_WINDOW_DAYS * DAY_MS;
}

function pushFactor(
  arr: IrRiskFactor[],
  factor: IrRiskFactorKey,
  value: number,
  weight: number,
  label: string
): void {
  arr.push({ factor, value, weight, contribution: round4(value * weight), label });
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
