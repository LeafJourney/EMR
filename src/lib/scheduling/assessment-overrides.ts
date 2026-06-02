// SAFE: dead-export-allowed reason="EMR-917 Tier-3 persistence; the assessments-page control + readiness consumer are later slices in the build sequence"
// EMR-917 — persistence for Tier-3 per-patient assessment overrides.
//
// The pure engine (assessment-rules.ts) takes overrides as an in-memory
// `Record<assessmentSlug, AssessmentOverride>`. This module is the thin DB
// binding that produces that record for a patient, and validates the stored
// string against the override enum so a bad row can never widen the engine's
// contract.

import { prisma } from "@/lib/db/prisma";
import type { AssessmentOverride } from "./assessment-rules";

const OVERRIDE_VALUES: readonly AssessmentOverride[] = ["require", "skip", "not_applicable"];

export function isAssessmentOverride(value: string): value is AssessmentOverride {
  return (OVERRIDE_VALUES as readonly string[]).includes(value);
}

/**
 * Load the clinician's Tier-3 overrides for a patient, as the engine's
 * `overrides` map. Org-scoped so a session can't read across orgs. Unknown
 * stored values are dropped (defensive — the engine only knows the three).
 */
export async function loadAssessmentOverrides(
  patientId: string,
  organizationId: string,
): Promise<Record<string, AssessmentOverride>> {
  const rows = await prisma.patientAssessmentOverride.findMany({
    where: { patientId, organizationId },
    select: { assessmentSlug: true, override: true },
  });

  const out: Record<string, AssessmentOverride> = {};
  for (const r of rows) {
    if (isAssessmentOverride(r.override)) out[r.assessmentSlug] = r.override;
  }
  return out;
}
