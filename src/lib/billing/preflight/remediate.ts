/**
 * One-click remediation loop — Phase 6 of the RCM red-text spec.
 * --------------------------------------------------------------
 * Pure helpers that apply a RootCauseFinding's RemediationAction to the
 * claim/context shape and re-run the pre-flight engine, demonstrating
 * the fix → re-run → green loop ("Append Modifier-25" → P_denial drops
 * below 0.10 → release to the EDI 837 compiler).
 *
 * Every helper is immutable: the input claim/context is never mutated.
 */

import type { RemediationAction } from "./attribution";
import type {
  EncounterContext,
  PreflightClaim,
  PreflightOptions,
  PreflightServiceLine,
} from "./features";
import { runPreflight, type PreflightResult } from "./engine";

// ---------------------------------------------------------------------------
// Claim-shape transforms
// ---------------------------------------------------------------------------

/** Append a modifier to the service line with `targetCode` (no-op if the
 *  line already carries it or the code isn't on the claim). */
export function appendModifier(
  claim: PreflightClaim,
  targetCode: string,
  modifier: string,
): PreflightClaim {
  const serviceLines: PreflightServiceLine[] = claim.serviceLines.map((line) => {
    if (line.code !== targetCode) return line;
    const modifiers = line.modifiers ?? [];
    if (modifiers.includes(modifier)) return line;
    return { ...line, modifiers: [...modifiers, modifier] };
  });
  return { ...claim, serviceLines };
}

/** Convenience for the spec's headline fix: append Modifier-25 to the
 *  E/M line. When `targetCode` is omitted, the first outpatient E/M
 *  line (99202–99215) is used. */
export function appendModifier25(claim: PreflightClaim, targetCode?: string): PreflightClaim {
  const target =
    targetCode ??
    claim.serviceLines.find((l) => /^992(0[2-5]|1[1-5])$/.test(l.code))?.code;
  if (!target) return claim;
  return appendModifier(claim, target, "25");
}

/** Consolidate an unbundled component into the comprehensive code by
 *  removing the component line item. */
export function removeComponentLine(
  claim: PreflightClaim,
  componentCode: string,
): PreflightClaim {
  return {
    ...claim,
    serviceLines: claim.serviceLines.filter((l) => l.code !== componentCode),
  };
}

/** Append documentation sentences to the narrative note (the
 *  "inject missing criteria" remediation for medical-necessity holds). */
export function augmentNarrative(
  context: EncounterContext,
  additions: string[],
): EncounterContext {
  if (additions.length === 0) return context;
  return {
    ...context,
    narrativeNote: [context.narrativeNote, ...additions].join(" ").trim(),
  };
}

// ---------------------------------------------------------------------------
// Action dispatcher + re-score loop
// ---------------------------------------------------------------------------

export interface RemediatedState {
  claim: PreflightClaim;
  context: EncounterContext;
}

/** Apply a typed RemediationAction from attribution.ts to the claim /
 *  encounter shapes. `manual_review` is a no-op by design. */
export function applyRemediation(
  claim: PreflightClaim,
  context: EncounterContext,
  action: RemediationAction,
): RemediatedState {
  switch (action.kind) {
    case "append_modifier":
      return { claim: appendModifier(claim, action.targetCode, action.modifier), context };
    case "remove_line":
      return { claim: removeComponentLine(claim, action.componentCode), context };
    case "augment_documentation":
      // The biller supplies real sentences in the UI; the pure helper
      // demonstrates the loop by injecting the required criteria terms.
      return { claim, context: augmentNarrative(context, action.requiredKeywords) };
    case "manual_review":
      return { claim, context };
  }
}

export interface RemediationRun {
  before: PreflightResult;
  after: PreflightResult;
  claim: PreflightClaim;
  context: EncounterContext;
  /** true when the fix moved the claim into the green-release zone. */
  released: boolean;
}

/** The one-click loop: score, apply the fix, re-score. */
export function remediateAndRescore(
  claim: PreflightClaim,
  context: EncounterContext,
  action: RemediationAction,
  options: PreflightOptions = {},
): RemediationRun {
  const before = runPreflight(claim, context, options);
  const fixed = applyRemediation(claim, context, action);
  const after = runPreflight(fixed.claim, fixed.context, options);
  return {
    before,
    after,
    claim: fixed.claim,
    context: fixed.context,
    released: after.score.disposition === "release",
  };
}
