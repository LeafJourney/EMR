// ---------------------------------------------------------------------------
// evaluateRxSafety — top-level entry point for the prescription-safety
// guardrail engine. Runs the three layers (PGx, organ clearance, botanical)
// and returns ranked findings (hard stops first), suitable for the inline
// optimization card UI described in Phase 6 of the red-text spec.
//
// The three layers are independent and side-effect-free, so they're evaluated
// in a concurrently-safe manner (Promise.all over synchronous evaluators —
// no shared mutable state, deterministic ordering applied after).
// ---------------------------------------------------------------------------

import { evaluateBotanical } from "./botanical";
import { evaluateOrgan } from "./organ";
import { evaluatePgx } from "./pgx";
import {
  type DraftOrder,
  type GuardrailFinding,
  type PatientRxProfile,
  type RxSafetyEvaluation,
  GUARDRAIL_KIND_RANK,
} from "./types";

const BLOCKING_KINDS = new Set<GuardrailFinding["kind"]>([
  "hard_stop",
  "hard_substitution",
]);

/** Stable, severity-first ordering for the optimization card. */
function rankFindings(findings: GuardrailFinding[]): GuardrailFinding[] {
  return [...findings].sort((a, b) => {
    const byKind = GUARDRAIL_KIND_RANK[a.kind] - GUARDRAIL_KIND_RANK[b.kind];
    if (byKind !== 0) return byKind;
    // Within the same severity, keep a deterministic layer order.
    return a.ruleId.localeCompare(b.ruleId);
  });
}

/**
 * Evaluate a drafted order against the patient's multi-omic profile across all
 * three guardrail layers. Returns ranked findings; an empty list means the
 * order is clean and the card should not render.
 *
 * @param order the drafted CPOE order
 * @param profile the assembled patient Rx profile
 * @param now injectable clock for deterministic lab-freshness evaluation
 */
export async function evaluateRxSafety(
  order: DraftOrder,
  profile: PatientRxProfile,
  now: Date = new Date()
): Promise<RxSafetyEvaluation> {
  // Each layer is pure + independent → safe to run concurrently.
  const [pgx, organ, botanical] = await Promise.all([
    Promise.resolve().then(() => evaluatePgx(order, profile.pgxVariants)),
    Promise.resolve().then(() => evaluateOrgan(order, profile, now)),
    Promise.resolve().then(() =>
      evaluateBotanical(order, profile.botanicalExposures)
    ),
  ]);

  const findings = rankFindings([...pgx, ...organ, ...botanical]);

  return {
    order,
    findings,
    hasBlockingFinding: findings.some((f) => BLOCKING_KINDS.has(f.kind)),
    evaluatedAt: now.toISOString(),
  };
}

export { evaluatePgx } from "./pgx";
export { evaluateOrgan, ckdEpi2021, childPugh, egfrBand } from "./organ";
export { evaluateBotanical, cannabinoidsFromExposures } from "./botanical";
export * from "./types";
