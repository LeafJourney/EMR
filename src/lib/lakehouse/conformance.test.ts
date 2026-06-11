import { describe, it, expect } from "vitest";
import { scoreConformance } from "./conformance";
import type { FhirJson } from "./types";

describe("scoreConformance", () => {
  it("passes a fully-coded, profiled observation", () => {
    const obs: FhirJson = {
      resourceType: "Observation",
      id: "o1",
      meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab"] },
      status: "final",
      code: { coding: [{ system: "http://loinc.org", code: "4548-4" }] },
      subject: { reference: "Patient/p1" },
    };
    const r = scoreConformance(obs);
    expect(r.state).toBe("pass");
    expect(r.confidence).toBeGreaterThan(0.9);
    expect(r.profile).toContain("us-core-observation-lab");
  });

  it("warns on free-text-only terminology", () => {
    const obs: FhirJson = {
      resourceType: "Observation",
      id: "o2",
      status: "final",
      code: { text: "Blood pressure" },
      subject: { reference: "Patient/p1" },
    };
    const r = scoreConformance(obs);
    expect(r.state).toBe("warn");
    expect(r.checks.some((c) => c.rule === "Terminology" && c.severity === "warn")).toBe(true);
  });

  it("errors when a mandatory element is missing", () => {
    const cond: FhirJson = {
      resourceType: "Condition",
      id: "c1",
      // missing clinicalStatus + code
      subject: { reference: "Patient/p1" },
    };
    const r = scoreConformance(cond);
    expect(r.state).toBe("error");
  });

  it("flags a blood-pressure panel missing components", () => {
    const bp: FhirJson = {
      resourceType: "Observation",
      id: "bp1",
      meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure"] },
      status: "final",
      code: { coding: [{ system: "http://loinc.org", code: "85354-9" }] },
      subject: { reference: "Patient/p1" },
    };
    const r = scoreConformance(bp);
    expect(r.checks.some((c) => c.rule === "BP components" && c.severity === "warn")).toBe(true);
  });
});
