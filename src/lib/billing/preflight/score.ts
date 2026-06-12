/**
 * Denial Probability Score — Phase 3 of the RCM red-text spec.
 * ------------------------------------------------------------
 * Deterministic logistic-style model:
 *
 *   P_denial = σ( b0 + w_cci·X_CCI + w_mod·modifierGap
 *                    + w_payer·V_payer + w_lcd·δ_LCD
 *                    + w_doc·(1 − φ_narrative.score) )
 *
 * Weight rationale (hand-calibrated against the acceptance scenarios in
 * EMR-1137; replace with trained coefficients once the 835-outcome
 * training loop lands):
 *
 *   intercept −3.0  → a fully clean claim sits around σ(−2.6…−2.3),
 *                     i.e. 7–9%, inside the green-release zone.
 *   xCci       3.0  → a hard NCCI unbundling violation alone pushes the
 *                     claim to ~50%+: always held.
 *   modifierGap 2.7 → a missing-but-fixable modifier (99214+96372 without
 *                     Mod-25) lands ~45–60%: held, but one click from green.
 *   vPayer     3.5  → a payer denying ~50% of a CPT in the last 180 days
 *                     adds ~1.75 logits — enough to push a borderline
 *                     claim over the hold line.
 *   deltaLcd   2.5  → full LCD discordance (1.0) adds 2.5 logits; combined
 *                     with a thin note this is the medical-necessity hold.
 *   narrativeDeficit 1.0 → documentation quality alone nudges, never
 *                     dominates — thin notes amplify other risks.
 */

import type { PreflightFeatures } from "./features";

export const SCORE_WEIGHTS = {
  intercept: -3.0,
  xCci: 3.0,
  modifierGap: 2.7,
  vPayer: 3.5,
  deltaLcd: 2.5,
  narrativeDeficit: 1.0,
} as const;

/** P_denial ≥ 0.35 → hold the claim in pre-submission staging. */
export const HOLD_THRESHOLD = 0.35;
/** P_denial < 0.10 → green zone, release to the EDI 837 compiler. */
export const GREEN_THRESHOLD = 0.1;

export type Disposition = "hold" | "review" | "release";

export type ScoreFeatureKey =
  | "xCci"
  | "modifierGap"
  | "vPayer"
  | "deltaLcd"
  | "narrativeDeficit";

export interface FeatureContribution {
  feature: ScoreFeatureKey;
  /** Raw feature value fed into the model. */
  value: number;
  weight: number;
  /** value × weight, in logits. Positive = pushes toward denial. */
  contribution: number;
}

export interface DenialScore {
  /** P_denial in [0,1]. */
  score: number;
  disposition: Disposition;
  /** Per-feature logit contributions, sorted descending — the
   *  deterministic stand-in for the spec's SHAP attribution. */
  breakdown: FeatureContribution[];
  intercept: number;
}

export function logistic(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function dispositionFor(score: number): Disposition {
  if (score >= HOLD_THRESHOLD) return "hold";
  if (score < GREEN_THRESHOLD) return "release";
  return "review";
}

export function computePDenial(features: PreflightFeatures): DenialScore {
  const narrativeDeficit = clamp01(1 - features.phiNarrative.score);
  const values: Record<ScoreFeatureKey, number> = {
    xCci: features.xCci,
    modifierGap: features.modifierGap,
    vPayer: clamp01(features.vPayer),
    deltaLcd: clamp01(features.deltaLcd),
    narrativeDeficit,
  };

  const breakdown: FeatureContribution[] = (
    Object.keys(values) as ScoreFeatureKey[]
  ).map((feature) => {
    const weight = SCORE_WEIGHTS[feature];
    const value = values[feature];
    return {
      feature,
      value: round4(value),
      weight,
      contribution: round4(value * weight),
    };
  });
  breakdown.sort((a, b) => b.contribution - a.contribution);

  const z =
    SCORE_WEIGHTS.intercept +
    breakdown.reduce((sum, c) => sum + c.contribution, 0);
  const score = round4(logistic(z));

  return {
    score,
    disposition: dispositionFor(score),
    breakdown,
    intercept: SCORE_WEIGHTS.intercept,
  };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
