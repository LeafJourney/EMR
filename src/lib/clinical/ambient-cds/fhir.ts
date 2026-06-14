// SAFE: dead-export-allowed reason="Ambient-CDS FHIR Clinical Reasoning serializers (EMR-1130); persists every IR_risk run, consumed by the LeafBridge FHIR store + sidebar audit trail"
// ---------------------------------------------------------------------------
// FHIR R4 Clinical Reasoning serialization — spec Phase 6 (Linear EMR-1130).
//
// Every ambient inference run is persisted as SMART on FHIR Clinical
// Reasoning resources so the insight is reproducible and audit-grade:
//   - GuidanceResponse : overarching lifecycle/execution state + dataset used
//   - RiskAssessment   : the computed IR_risk score + validation parameters
//   - CarePlan         : the philosophy-aligned interventions proposed
//
// Pure mappers returning plain FHIR objects, matching the conventions in
// src/lib/platform/fhir.ts. A `zod` round-trip extractor verifies the score
// survives serialization (EMR-1130 acceptance: round-trip + zod).
// ---------------------------------------------------------------------------

import { z } from "zod";
import type { IrRiskBand, IrRiskResult } from "./types";

const MODULE_URI = "https://leafjourney.com/cds/ambient-insulin-resistance";

export interface AmbientCdsContext {
  patientId: string;
  encounterId?: string;
  /** Stable id for this inference run; namespaces the emitted resources. */
  runId?: string;
}

/** FHIR risk-probability value-set code for a qualitative band. */
const BAND_RISK_CODE: Record<IrRiskBand, string> = {
  optimal: "negligible",
  moderate: "moderate",
  high: "high",
  severe: "high",
};

function subjectRef(ctx: AmbientCdsContext): Record<string, unknown> {
  return { reference: `Patient/${ctx.patientId}` };
}

function encounterRef(
  ctx: AmbientCdsContext
): Record<string, unknown> | undefined {
  return ctx.encounterId
    ? { reference: `Encounter/${ctx.encounterId}` }
    : undefined;
}

/**
 * RiskAssessment — houses the computed metric score, the formal validation
 * parameters (per-factor logit contributions), and the qualitative class.
 */
export function toFhirRiskAssessment(
  result: IrRiskResult,
  ctx: AmbientCdsContext
): Record<string, unknown> {
  return {
    resourceType: "RiskAssessment",
    id: ctx.runId ? `${ctx.runId}-risk` : undefined,
    status: "final",
    subject: subjectRef(ctx),
    encounter: encounterRef(ctx),
    occurrenceDateTime: result.evaluatedAt,
    method: {
      text: "Wearable-Augmented Dynamic Insulin Resistance Risk Index (IR_risk)",
    },
    code: {
      coding: [
        {
          system: "http://snomed.info/sct",
          code: "237536009",
          display: "Insulin resistance",
        },
      ],
    },
    prediction: [
      {
        outcome: { text: "Insulin resistance" },
        probabilityDecimal: result.score,
        qualitativeRisk: {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/risk-probability",
              code: BAND_RISK_CODE[result.band],
              display: result.band,
            },
          ],
        },
      },
    ],
    // HOMA-IR + each engineered factor, so the score is fully reconstructable.
    note: [
      {
        text: [
          `HOMA-IR ${result.homaIr}`,
          ...result.factors.map(
            (f) => `${f.label}: ${f.contribution} logits`
          ),
          result.lowConfidence ? "low confidence: stale fasting panel" : null,
          result.wearableAugmented
            ? "wearable-augmented"
            : "labs-only estimate",
        ]
          .filter(Boolean)
          .join("; "),
      },
    ],
  };
}

/**
 * GuidanceResponse — the lifecycle/execution wrapper, verifying which dataset
 * components the ambient engine actually used for this run.
 *
 * @param datasetComponents human-readable list, e.g.
 *   ["fasting glucose 74318-7", "CGM 14d", "nocturnal HRV"].
 */
export function toFhirGuidanceResponse(
  result: IrRiskResult,
  ctx: AmbientCdsContext,
  datasetComponents: string[]
): Record<string, unknown> {
  return {
    resourceType: "GuidanceResponse",
    id: ctx.runId,
    moduleUri: MODULE_URI,
    status: "success",
    subject: subjectRef(ctx),
    encounter: encounterRef(ctx),
    occurrenceDateTime: result.evaluatedAt,
    reasonCode: datasetComponents.map((c) => ({ text: c })),
    note: [
      {
        text: `IR_risk ${result.score} (${result.band}); ${
          result.wearableAugmented ? "wearable-augmented" : "labs-only"
        }`,
      },
    ],
  };
}

/** A philosophy-aligned intervention to propose on the CarePlan. */
export interface CarePlanIntervention {
  title: string;
  detail?: string;
  category?: "lifestyle" | "diet" | "monitoring" | "pharmacological";
}

/**
 * CarePlan — the philosophy-aligned intervention set (proposal/draft until a
 * provider authorizes). Interventions are caller-supplied so this serializer
 * stays independent of the practice-philosophy config (EMR-1129).
 */
export function toFhirCarePlan(
  interventions: CarePlanIntervention[],
  ctx: AmbientCdsContext,
  createdAt: string
): Record<string, unknown> {
  return {
    resourceType: "CarePlan",
    id: ctx.runId ? `${ctx.runId}-careplan` : undefined,
    status: "draft",
    intent: "proposal",
    subject: subjectRef(ctx),
    encounter: encounterRef(ctx),
    created: createdAt,
    activity: interventions.map((iv) => ({
      detail: {
        kind: "ServiceRequest",
        status: "not-started",
        code: iv.category ? { text: iv.category } : undefined,
        description: iv.detail ? `${iv.title} — ${iv.detail}` : iv.title,
      },
    })),
  };
}

/**
 * Compose all three resources into one FHIR transaction Bundle — the atomic
 * unit persisted per inference run (spec Phase 6).
 */
export function toAmbientCdsBundle(
  result: IrRiskResult,
  ctx: AmbientCdsContext,
  opts: {
    datasetComponents: string[];
    interventions?: CarePlanIntervention[];
    createdAt?: string;
  }
): Record<string, unknown> {
  const createdAt = opts.createdAt ?? result.evaluatedAt;
  const resources: Record<string, unknown>[] = [
    toFhirGuidanceResponse(result, ctx, opts.datasetComponents),
    toFhirRiskAssessment(result, ctx),
  ];
  if (opts.interventions && opts.interventions.length > 0) {
    resources.push(toFhirCarePlan(opts.interventions, ctx, createdAt));
  }
  return {
    resourceType: "Bundle",
    type: "transaction",
    entry: resources.map((resource) => ({
      resource,
      request: {
        method: "POST",
        url: (resource as { resourceType: string }).resourceType,
      },
    })),
  };
}

// ── round-trip extraction (zod-validated) ─────────────────────────────────

const riskAssessmentScoreSchema = z.object({
  resourceType: z.literal("RiskAssessment"),
  prediction: z
    .array(z.object({ probabilityDecimal: z.number().min(0).max(1) }))
    .min(1),
});

/**
 * Recover the IR_risk score from a serialized RiskAssessment, validating the
 * shape with zod. Round-trips `toFhirRiskAssessment` losslessly for the score.
 */
export function irScoreFromFhir(resource: unknown): number {
  return riskAssessmentScoreSchema.parse(resource).prediction[0]
    .probabilityDecimal;
}
