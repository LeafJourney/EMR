/**
 * Root-cause attribution — Phase 4 of the RCM red-text spec.
 * ----------------------------------------------------------
 * Takes the extracted feature vector + per-feature score contributions
 * (the deterministic stand-in for SHAP values) and stratifies the risk
 * into typed deficiency categories with concrete remediation guidance:
 *
 *   modifier_deficiency       — e.g. 99214 + 96372 same day without
 *                               Modifier-25 on the E/M line.
 *   medical_necessity_deficit — δ_LCD > 0.80 paired with a low narrative
 *                               score (e.g. 70553 Brain MRI for plain R51
 *                               headache, no red-flag documentation).
 *   unbundling_conflict       — X_CCI = 1 (component billed alongside its
 *                               comprehensive code, never unbundleable).
 *   payer_history_risk        — the target payer has been denying this
 *                               CPT heavily in the rolling 180-day window.
 *   documentation_quality     — thin narrative dragging the score even
 *                               though coding/coverage are concordant.
 *
 * Each finding carries a machine-applicable RemediationAction consumed by
 * remediate.ts (the one-click fix loop) and a mapping into the existing
 * denial taxonomy (src/lib/billing/denials.ts) so post-submission denial
 * analytics and pre-submission holds share one vocabulary.
 */

import type { DenialCategory } from "@/lib/billing/denials";
import type { PreflightFeatures } from "./features";
import type { DenialScore, ScoreFeatureKey } from "./score";

export type DeficiencyCategory =
  | "modifier_deficiency"
  | "medical_necessity_deficit"
  | "unbundling_conflict"
  | "payer_history_risk"
  | "documentation_quality";

/** Bridge into the post-submission denial taxonomy. */
export const DEFICIENCY_TO_DENIAL_CATEGORY: Record<DeficiencyCategory, DenialCategory> = {
  modifier_deficiency: "modifier",
  medical_necessity_deficit: "medical_necessity",
  unbundling_conflict: "bundling",
  payer_history_risk: "other",
  documentation_quality: "medical_necessity",
};

export type RemediationAction =
  | { kind: "append_modifier"; targetCode: string; modifier: "25" | "59" }
  | { kind: "remove_line"; componentCode: string }
  | { kind: "augment_documentation"; targetCode: string; requiredKeywords: string[] }
  | { kind: "manual_review"; note: string };

export interface RootCauseFinding {
  category: DeficiencyCategory;
  denialCategory: DenialCategory;
  /** Which score feature drove this finding. */
  drivingFeature: ScoreFeatureKey;
  /** Logit contribution of the driving feature — findings are ranked by it. */
  contribution: number;
  summary: string;
  /** Concrete biller-facing remediation text. */
  remediation: string;
  /** Machine-applicable action for the one-click fix loop (remediate.ts). */
  action: RemediationAction;
  relatedCodes: string[];
}

const NARRATIVE_LOW_SCORE = 0.4;
const MEDICAL_NECESSITY_DELTA = 0.8;
const PAYER_RISK_RATE = 0.25;
const PAYER_RISK_MIN_SAMPLE = 5;

export function attributeRootCauses(
  features: PreflightFeatures,
  score: DenialScore,
): RootCauseFinding[] {
  const contributionOf = (feature: ScoreFeatureKey): number =>
    score.breakdown.find((c) => c.feature === feature)?.contribution ?? 0;

  const findings: RootCauseFinding[] = [];

  // ── Modifier deficiency ────────────────────────────────────────────
  for (const hit of features.details.modifierGapHits) {
    const modifier = hit.allowedModifier ?? "25";
    const evidenceNote = features.phiNarrative.mod25Evidence
      ? "The note already documents a separately identifiable evaluation."
      : "Confirm the note documents a separate evaluation before appending.";
    findings.push({
      category: "modifier_deficiency",
      denialCategory: DEFICIENCY_TO_DENIAL_CATEGORY.modifier_deficiency,
      drivingFeature: "modifierGap",
      contribution: contributionOf("modifierGap"),
      summary: `${hit.componentCode} billed with ${hit.comprehensiveCode} on the same day without Modifier-${modifier} on the ${hit.comprehensiveCode} line.`,
      remediation: `Append Modifier-${modifier} to ${hit.comprehensiveCode} if the note documents a separate evaluation. ${evidenceNote}`,
      action: {
        kind: "append_modifier",
        targetCode: hit.comprehensiveCode,
        modifier: modifier === "59" ? "59" : "25",
      },
      relatedCodes: [hit.comprehensiveCode, hit.componentCode],
    });
  }

  // ── Unbundling conflict ────────────────────────────────────────────
  for (const hit of features.details.unbundlingHits) {
    findings.push({
      category: "unbundling_conflict",
      denialCategory: DEFICIENCY_TO_DENIAL_CATEGORY.unbundling_conflict,
      drivingFeature: "xCci",
      contribution: contributionOf("xCci"),
      summary: `NCCI edit: component code ${hit.componentCode} is included in comprehensive code ${hit.comprehensiveCode || "the comprehensive service"} and cannot be unbundled with a modifier.`,
      remediation: `Consolidate the component line item into the comprehensive code: remove ${hit.componentCode} from the claim — it is bundled into ${hit.comprehensiveCode || "the comprehensive service"}.`,
      action: { kind: "remove_line", componentCode: hit.componentCode },
      relatedCodes: [hit.componentCode, hit.comprehensiveCode].filter(Boolean),
    });
  }

  // ── Medical necessity deficit ──────────────────────────────────────
  if (features.deltaLcd > MEDICAL_NECESSITY_DELTA) {
    const worstLine = [...features.details.lcdLines].sort((a, b) => b.delta - a.delta)[0];
    const lowNarrative = features.phiNarrative.score < NARRATIVE_LOW_SCORE;
    const keywords = worstLine?.missingKeywords ?? [];
    const criteriaText =
      keywords.length > 0
        ? `Document required criteria: ${keywords.join(", ")}.`
        : "Document the payer's LCD coverage criteria for this CPT.";
    findings.push({
      category: "medical_necessity_deficit",
      denialCategory: DEFICIENCY_TO_DENIAL_CATEGORY.medical_necessity_deficit,
      drivingFeature: "deltaLcd",
      contribution: contributionOf("deltaLcd"),
      summary: `${worstLine?.cptCode ?? "Service"} does not match an approved LCD coverage pairing (δ_LCD = ${features.deltaLcd})${lowNarrative ? " and the narrative documentation score is low" : ""}.`,
      remediation: `${criteriaText} The payer requires documented treatment failure or red-flag indicators (e.g. progressive neurological deficits) for this CPT${worstLine && !worstLine.icdConcordant ? ", or link a covered diagnosis" : ""}.`,
      action: {
        kind: "augment_documentation",
        targetCode: worstLine?.cptCode ?? "",
        requiredKeywords: keywords,
      },
      relatedCodes: worstLine ? [worstLine.cptCode] : [],
    });
  } else if (
    features.phiNarrative.score < NARRATIVE_LOW_SCORE &&
    contributionOf("narrativeDeficit") > 0
  ) {
    // ── Documentation quality (no hard coverage mismatch) ────────────
    findings.push({
      category: "documentation_quality",
      denialCategory: DEFICIENCY_TO_DENIAL_CATEGORY.documentation_quality,
      drivingFeature: "narrativeDeficit",
      contribution: contributionOf("narrativeDeficit"),
      summary: `Narrative documentation is thin (score ${features.phiNarrative.score}): ${features.phiNarrative.organSystemCount} organ system(s) reviewed, MDM tier ${features.phiNarrative.mdmTier}.`,
      remediation:
        "Expand the note: document the systems reviewed, the medical decision-making severity, and any treatment plan adjustments before submission.",
      action: { kind: "manual_review", note: "Strengthen narrative documentation." },
      relatedCodes: [],
    });
  }

  // ── Payer history risk ─────────────────────────────────────────────
  const ph = features.details.payerHistory;
  if (ph.rate >= PAYER_RISK_RATE && ph.sampleSize >= PAYER_RISK_MIN_SAMPLE) {
    findings.push({
      category: "payer_history_risk",
      denialCategory: DEFICIENCY_TO_DENIAL_CATEGORY.payer_history_risk,
      drivingFeature: "vPayer",
      contribution: contributionOf("vPayer"),
      summary: `Payer has denied ${Math.round(ph.rate * 100)}% of ${ph.worstCpt} claims over the rolling 180-day window (n=${ph.sampleSize}).`,
      remediation: `Review the payer's recent denial reasons for ${ph.worstCpt} before submitting; consider attaching supporting documentation proactively or confirming coverage policy changes.`,
      action: {
        kind: "manual_review",
        note: `Audit recent ${ph.worstCpt} denials for this payer.`,
      },
      relatedCodes: ph.worstCpt ? [ph.worstCpt] : [],
    });
  }

  return findings.sort((a, b) => b.contribution - a.contribution);
}
