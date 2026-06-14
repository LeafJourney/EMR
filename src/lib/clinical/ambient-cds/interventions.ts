// SAFE: dead-export-allowed reason="Philosophy-aligned IR interventions (EMR-1129 partial); consumed by the EMR-1128 ambient panel + feeds the EMR-1130 CarePlan serializer"
// ---------------------------------------------------------------------------
// Practice-aligned clinical interventions — spec Phase 5 "Clinic Preference
// Configuration Framework" (Linear EMR-1129, epic EMR-1118).
//
// Maps an IR_risk result to philosophy-ordered intervention suggestions.
// Per the spec AND CLAUDE.md's Dr. Patel directive, metabolic restoration,
// lifestyle modification, and therapeutic fasting are prioritized AHEAD of
// long-term pharmaceuticals — pharmacologic options surface only at the
// severe band and always sort last.
//
// These are decision-support SUGGESTIONS, not orders: the one-click
// billing-code + lab-scheduling + checkout-queue integration is the rest of
// EMR-1129. They share the CarePlanIntervention shape so the FHIR CarePlan
// serializer (EMR-1130) can persist them verbatim once a run is stored.
// ---------------------------------------------------------------------------

import type { CarePlanIntervention } from "./fhir";
import type { IrRiskResult } from "./types";

/** Score at/above which it is worth suggesting anything at all. */
const SUGGEST_THRESHOLD = 0.35; // = the "moderate" band floor
/** Score at/above which a pharmacologic discussion is appropriate. */
const PHARMA_THRESHOLD = 0.85; // = the "severe" band floor

function hasFactor(result: IrRiskResult, key: string): boolean {
  return result.factors.some((f) => f.factor === key && f.contribution > 0);
}

/**
 * Build the philosophy-ordered intervention list for an IR_risk result.
 * Empty for optimal/low scores (nothing to nudge — Zen-Density). Deterministic.
 */
export function recommendIrInterventions(
  result: IrRiskResult
): CarePlanIntervention[] {
  if (result.score < SUGGEST_THRESHOLD) return [];

  const out: CarePlanIntervention[] = [];

  // Confirm-first when the anchor labs are stale — never act on old data.
  if (result.lowConfidence) {
    out.push({
      title: "Re-draw fasting glucose + insulin",
      detail: "Current panel is over 180 days old — confirm before acting.",
      category: "monitoring",
    });
  }

  // Lifestyle / metabolic first (always, for moderate+).
  out.push({
    title: "Time-restricted eating (14:10)",
    detail:
      "An 8–10 hour daily eating window (e.g. 11:00–19:00) to steady insulin levels.",
    category: "diet",
  });
  out.push({
    title: "Daily brisk walk (20 min)",
    detail: "Post-meal movement clears glucose and improves insulin sensitivity.",
    category: "lifestyle",
  });

  // Telemetry-specific nudge when CGM variability is a live driver.
  if (hasFactor(result, "cgmVariability")) {
    out.push({
      title: "Review continuous glucose monitor trends",
      detail: "Glycemic variability is elevated — target post-prandial spikes.",
      category: "monitoring",
    });
  }

  // Standard re-check cadence.
  out.push({
    title: "Recheck fasting glucose + insulin in 12 weeks",
    detail: "Track HOMA-IR response to the lifestyle plan.",
    category: "monitoring",
  });

  // Pharmacologic discussion — severe only, and always last.
  if (result.score >= PHARMA_THRESHOLD) {
    out.push({
      title: "Discuss pharmacologic options if targets unmet",
      detail:
        "Consider an insulin-sensitizer (e.g. metformin) at follow-up only if lifestyle targets are not met.",
      category: "pharmacological",
    });
  }

  return out;
}
