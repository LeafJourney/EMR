/**
 * Pre-flight engine — single entry point: extract features → score →
 * attribute root causes. Pure and synchronous; the caller supplies all
 * data (claim, encounter narrative, historical payer outcomes).
 *
 * TODO(EMR-1137 wiring — do NOT wire from this module; orchestrator task):
 * Interception point sits between superbill signing and the 837 compiler:
 *   1. RCM pipeline: add a `preflight` stage between "coding_scrub" and
 *      "submission" in src/lib/billing/rcm-engine.ts (STAGE_ORDER), so a
 *      `hold` disposition branches to a staging queue instead of
 *      advancing to submission.
 *   2. Submission gate: src/lib/agents/billing/clearinghouse-submission-agent.ts
 *      already refuses to submit when scrubResult.status === "blocked";
 *      the same guard should refuse when the latest preflight disposition
 *      is "hold", immediately before it calls buildClaimEdi()
 *      (src/lib/billing/edi/build-from-claim.ts).
 *   3. Caller feeds `payerHistory` from a Prisma query over adjudicated
 *      claims/835 outcomes for the claim's payer within 180 days — this
 *      module never queries the DB.
 */

import {
  extractFeatures,
  type EncounterContext,
  type PreflightClaim,
  type PreflightFeatures,
  type PreflightOptions,
} from "./features";
import { computePDenial, type DenialScore } from "./score";
import { attributeRootCauses, type RootCauseFinding } from "./attribution";

export interface PreflightResult {
  features: PreflightFeatures;
  score: DenialScore;
  findings: RootCauseFinding[];
}

export function runPreflight(
  claim: PreflightClaim,
  context: EncounterContext,
  options: PreflightOptions = {},
): PreflightResult {
  const features = extractFeatures(claim, context, options);
  const score = computePDenial(features);
  const findings = attributeRootCauses(features, score);
  return { features, score, findings };
}
