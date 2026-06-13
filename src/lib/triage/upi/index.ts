// UPI — Urgency Priority Index, end-to-end message triage (EMR-1146/1147).
//
// Deterministic clinical message-triage engine per the "Asynchronous
// Triage & Smart Check-ins" red-text spec, Phases 1–4
// (docs/product-feedback/2026-06-12_workflows-revisions-red-text.md).
// Fixes EMR-1090: (1) under-escalation of a real emergency message,
// (2) over-triage of a benign message as Urgent/Adverse.
//
// Pipeline: normalize → extract entities (negation + subject attribution)
// → distress score → UPI weighted sum → route decision.
//
//   UPI ≥ 0.75 → "urgent": bypass routine queues, include the
//                 pre-configured 911/ED safety auto-reply.
//   UPI < 0.75 → "standard": routed to the normal triage pool, sorted
//                 by score.
//
// The engine is the PRIMARY triage signal; any LLM layer is advisory only.

import { scoreDistress, type DistressSignal } from "./distress";
import { extractEntities, type EntityExtractionResult } from "./entities";
import {
  computeUpi,
  URGENT_THRESHOLD,
  type UpiFactors,
  type UpiWeights,
  type VulnerabilityFlags,
} from "./upi";

export * from "./entities";
export * from "./distress";
export * from "./upi";

/** Chart context an integration can pass alongside the message text. */
export interface UpiPatientContext {
  vulnerability?: VulnerabilityFlags;
  /** Optional weight override — defaults to DEFAULT_WEIGHTS. */
  weights?: UpiWeights;
}

export interface TriageDecision {
  route: "urgent" | "standard";
  /** Final UPI score in [0, 1]. */
  upi: number;
  /** Full factor breakdown for clinician transparency. */
  factors: UpiFactors;
  /** Pre-configured 911/ED safety reply — present only on urgent routes. */
  autoReply?: string;
}

/**
 * Spec Phase 4.1 — automated red-flag response sent back on the patient's
 * channel the moment a message routes urgent.
 */
export const URGENT_AUTO_REPLY =
  "Your message flags critical symptoms. Please immediately hang up and dial 911 " +
  "or proceed to the nearest emergency department. Our clinical team has also " +
  "been alerted and will follow up with you directly.";

/**
 * End-to-end deterministic triage of a raw patient message.
 * Pure function — no LLM, no I/O, same input always yields same decision.
 */
export function triageMessage(
  rawText: string,
  patientContext?: UpiPatientContext,
): TriageDecision {
  const entities: EntityExtractionResult = extractEntities(rawText);
  const distress: DistressSignal = scoreDistress(rawText);
  const { score, factors } = computeUpi({
    entities,
    distress,
    vulnerability: patientContext?.vulnerability,
    weights: patientContext?.weights,
  });

  if (score >= URGENT_THRESHOLD) {
    return { route: "urgent", upi: score, factors, autoReply: URGENT_AUTO_REPLY };
  }
  return { route: "standard", upi: score, factors };
}

// ── Chart → vulnerability flag derivation ──────────────────────────────

const CARDIOVASCULAR_RE =
  /\bheart failure\b|\bcardiomyopathy\b|\bcoronary artery\b|\bmyocardial infarction\b|\bheart attack\b|\batrial fibrillation\b|\barrhythmi\w*\b|\bcardiovascular disease\b|\bunstable angina\b|\baortic\b|\bcardiac\b/i;

const METABOLIC_RE =
  /\buncontrolled diabetes\b|\btype 1 diabetes\b|\bketoacidosis\b|\bdka\b|\badrenal insufficiency\b|\bcirrhosis\b|\b(?:renal|kidney|liver) failure\b|\bdialysis\b|\besrd\b/i;

const POST_OP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Derive UPI vulnerability flags from chart records (PastMedicalCondition,
 * PastSurgery, Patient.contraindications). Pure — callers fetch the rows.
 *
 * TODO(EMR-1147): PastSurgery.performedDateText is free text; until a real
 * performedAt column exists we approximate the 30-day post-op window with
 * the row's createdAt (surgeries are typically charted near the event).
 */
export function deriveVulnerabilityFlags(input: {
  conditions?: ReadonlyArray<{ condition: string }>;
  contraindications?: ReadonlyArray<string>;
  surgeries?: ReadonlyArray<{ createdAt: Date | string }>;
  now?: Date;
}): VulnerabilityFlags {
  const now = input.now ?? new Date();
  const conditionText = [
    ...(input.conditions ?? []).map((c) => c.condition),
    ...(input.contraindications ?? []),
  ].join(" \n ");

  const postOpWithin30Days = (input.surgeries ?? []).some((s) => {
    const at = s.createdAt instanceof Date ? s.createdAt : new Date(s.createdAt);
    if (Number.isNaN(at.getTime())) return false;
    const delta = now.getTime() - at.getTime();
    return delta >= 0 && delta <= POST_OP_WINDOW_MS;
  });

  return {
    severeCardiovascularDisease: CARDIOVASCULAR_RE.test(conditionText),
    advancedMetabolicInstability: METABOLIC_RE.test(conditionText),
    postOpWithin30Days,
  };
}
