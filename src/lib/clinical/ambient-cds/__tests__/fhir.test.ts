// FHIR Clinical Reasoning serialization round-trip (EMR-1130).

import { describe, expect, it } from "vitest";
import { computeIrRisk } from "../ir-risk";
import {
  irScoreFromFhir,
  toAmbientCdsBundle,
  toFhirCarePlan,
  toFhirGuidanceResponse,
  toFhirRiskAssessment,
  type AmbientCdsContext,
} from "../fhir";
import type { IrRiskResult } from "../types";

const NOW = new Date("2026-06-14T12:00:00.000Z");
const CTX: AmbientCdsContext = {
  patientId: "pat-1",
  encounterId: "enc-9",
  runId: "run-42",
};

function sampleResult(): IrRiskResult {
  return computeIrRisk(
    {
      biomarkers: {
        fastingGlucoseMgDl: 105,
        fastingInsulinUIuMl: 12,
        hba1cPct: 5.9,
      },
      normalizedTelemetry: {
        cgmVariabilityPct: 28,
        hrvReductionMs: 18,
        cgmDays: 14,
        hrvDays: 14,
      },
    },
    NOW
  )!;
}

describe("toFhirRiskAssessment", () => {
  it("emits a valid-shaped RiskAssessment carrying the score + qualitative band", () => {
    const result = sampleResult();
    const ra = toFhirRiskAssessment(result, CTX) as Record<string, any>;

    expect(ra.resourceType).toBe("RiskAssessment");
    expect(ra.id).toBe("run-42-risk");
    expect(ra.status).toBe("final");
    expect(ra.subject.reference).toBe("Patient/pat-1");
    expect(ra.encounter.reference).toBe("Encounter/enc-9");
    expect(ra.prediction[0].probabilityDecimal).toBe(result.score);
    expect(ra.prediction[0].qualitativeRisk.coding[0].code).toBe("high");
    // SNOMED concept for insulin resistance
    expect(ra.code.coding[0].code).toBe("237536009");
  });

  it("round-trips the score through zod extraction", () => {
    const result = sampleResult();
    const ra = toFhirRiskAssessment(result, CTX);
    expect(irScoreFromFhir(ra)).toBe(result.score);
  });

  it("rejects a malformed RiskAssessment", () => {
    expect(() => irScoreFromFhir({ resourceType: "Patient" })).toThrow();
    expect(() =>
      irScoreFromFhir({ resourceType: "RiskAssessment", prediction: [] })
    ).toThrow();
  });
});

describe("toFhirGuidanceResponse", () => {
  it("records lifecycle status + the dataset components used", () => {
    const result = sampleResult();
    const gr = toFhirGuidanceResponse(result, CTX, [
      "fasting glucose 74318-7",
      "CGM 14d",
      "nocturnal HRV",
    ]) as Record<string, any>;

    expect(gr.resourceType).toBe("GuidanceResponse");
    expect(gr.id).toBe("run-42");
    expect(gr.status).toBe("success");
    expect(gr.moduleUri).toContain("ambient-insulin-resistance");
    expect(gr.reasonCode).toHaveLength(3);
    expect(gr.reasonCode[0].text).toBe("fasting glucose 74318-7");
  });
});

describe("toFhirCarePlan", () => {
  it("proposes philosophy-aligned interventions as draft activities", () => {
    const cp = toFhirCarePlan(
      [
        {
          title: "Time-restricted eating 14:10",
          detail: "11:00–19:00 window",
          category: "diet",
        },
        { title: "Recheck fasting insulin in 12 weeks", category: "monitoring" },
      ],
      CTX,
      NOW.toISOString()
    ) as Record<string, any>;

    expect(cp.resourceType).toBe("CarePlan");
    expect(cp.status).toBe("draft");
    expect(cp.intent).toBe("proposal");
    expect(cp.activity).toHaveLength(2);
    expect(cp.activity[0].detail.description).toContain("14:10");
    expect(cp.activity[0].detail.code.text).toBe("diet");
  });
});

describe("toAmbientCdsBundle", () => {
  it("bundles the three resources as a FHIR transaction", () => {
    const result = sampleResult();
    const bundle = toAmbientCdsBundle(result, CTX, {
      datasetComponents: ["fasting panel", "CGM 14d", "nocturnal HRV"],
      interventions: [{ title: "Walk 20 min daily", category: "lifestyle" }],
    }) as Record<string, any>;

    expect(bundle.type).toBe("transaction");
    const kinds = bundle.entry.map(
      (e: any) => e.resource.resourceType as string
    );
    expect(kinds).toEqual(["GuidanceResponse", "RiskAssessment", "CarePlan"]);
    expect(bundle.entry[0].request).toEqual({
      method: "POST",
      url: "GuidanceResponse",
    });
  });

  it("omits the CarePlan when no interventions are supplied", () => {
    const result = sampleResult();
    const bundle = toAmbientCdsBundle(result, CTX, {
      datasetComponents: ["fasting panel"],
    }) as Record<string, any>;
    const kinds = bundle.entry.map((e: any) => e.resource.resourceType);
    expect(kinds).not.toContain("CarePlan");
  });
});
