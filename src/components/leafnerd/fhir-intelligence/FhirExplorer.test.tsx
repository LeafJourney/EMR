import { describe, it, expect } from "vitest";
import {
  deriveUsCoreChecks,
  tallyChecks,
  resolveRelatedTarget,
  collapsedSummary,
} from "./FhirExplorer";
import type { FhirResource } from "@/lib/leafnerd/types";

// Minimal fixtures mirroring the curated DEMO_DATA shapes in analytics.ts.
const patient: FhirResource = {
  id: "pat-1",
  type: "Patient",
  label: "Marcus Delgado",
  patient: "Marcus Delgado",
  status: "active",
  mapping: 0.99,
  valid: "pass",
  profile: "US Core Patient",
  code: "MRN 40291 · identity 0.99",
  date: "2024-01-02",
  json: {
    resourceType: "Patient",
    id: "PT-40291",
    identifier: [{ system: "urn:mrn", value: "40291" }],
    name: [{ family: "Delgado", given: ["Marcus"] }],
    gender: "male",
    birthDate: "1958-07-19",
  },
  related: [
    { t: "Coverage", l: "Medicare Advantage" },
    { t: "Condition", l: "3 active" },
  ],
  provenance: [],
};

const observation: FhirResource = {
  id: "obs-1",
  type: "Observation",
  label: "HbA1c 8.2%",
  patient: "Marcus Delgado",
  status: "final",
  mapping: 0.98,
  valid: "pass",
  profile: "US Core Laboratory Result",
  code: "4548-4 · Hemoglobin A1c/Hemoglobin.total",
  date: "2026-05-28",
  json: {
    resourceType: "Observation",
    id: "obs-1",
    status: "final",
    code: { coding: [{ system: "http://loinc.org", code: "4548-4" }], text: "HbA1c" },
    subject: { reference: "Patient/PT-40291", display: "Marcus Delgado" },
    valueQuantity: { value: 8.2, unit: "%" },
  },
  related: [
    { t: "Patient", l: "Marcus Delgado" },
    { t: "DiagnosticReport", l: "Comprehensive metabolic" },
  ],
  provenance: [],
};

const bpWarn: FhirResource = {
  id: "obs-2",
  type: "Observation",
  label: "Blood pressure 148/92",
  patient: "Andre Boucher",
  status: "final",
  mapping: 0.96,
  valid: "warn",
  profile: "US Core Blood Pressure",
  code: "85354-9 · Blood pressure panel",
  date: "2026-05-30",
  json: {
    resourceType: "Observation",
    id: "obs-2",
    status: "final",
    code: { text: "Blood pressure" },
    subject: { reference: "Patient/PT-38820" },
    valueString: "148/92 mmHg",
  },
  related: [{ t: "Patient", l: "Andre Boucher" }],
  provenance: [],
};

const medErr: FhirResource = {
  id: "med-1",
  type: "MedicationRequest",
  label: "Metformin 1000mg",
  patient: "Marcus Delgado",
  status: "active",
  mapping: 0.58,
  valid: "err",
  profile: "US Core MedicationRequest",
  code: "unmapped · local vocab 'MTF1000'",
  date: "2026-05-12",
  json: {
    resourceType: "MedicationRequest",
    id: "med-1",
    status: "active",
    intent: "order",
    medicationCodeableConcept: { text: "MTF1000", coding: [] },
    subject: { reference: "Patient/PT-40291" },
  },
  related: [{ t: "Patient", l: "Marcus Delgado" }],
  provenance: [],
};

const all = [patient, observation, bpWarn, medErr];

describe("deriveUsCoreChecks", () => {
  it("reports an all-pass Patient with no warnings or errors", () => {
    const counts = tallyChecks(deriveUsCoreChecks(patient));
    expect(counts.warn).toBe(0);
    expect(counts.err).toBe(0);
    expect(counts.ok).toBeGreaterThan(0);
  });

  it("flags an empty coding[] medication as a terminology error", () => {
    const checks = deriveUsCoreChecks(medErr);
    const term = checks.find((c) => c.rule === "Terminology");
    expect(term?.kind).toBe("err");
    expect(term?.el).toBe("medicationCodeableConcept");
    // 0.58 mapping is also below the measure threshold → a warning.
    expect(checks.some((c) => c.rule === "Confidence" && c.kind === "warn")).toBe(true);
    expect(tallyChecks(checks).err).toBeGreaterThan(0);
  });

  it("warns (not errors) on a text-only blood-pressure observation", () => {
    const checks = deriveUsCoreChecks(bpWarn);
    const counts = tallyChecks(checks);
    expect(counts.err).toBe(0);
    expect(counts.warn).toBeGreaterThan(0);
    // Missing systolic/diastolic component codes is surfaced.
    expect(checks.some((c) => c.rule === "Components" && c.kind === "warn")).toBe(true);
  });

  it("passes a properly coded lab observation with a resolved subject", () => {
    const checks = deriveUsCoreChecks(observation);
    expect(checks.some((c) => c.rule === "Terminology" && c.kind === "ok")).toBe(true);
    expect(checks.some((c) => c.rule === "Reference" && c.kind === "ok")).toBe(true);
    expect(tallyChecks(checks).err).toBe(0);
  });

  it("recognizes an asserted meta.profile", () => {
    const withMeta: FhirResource = {
      ...patient,
      json: {
        resourceType: "Patient",
        id: "PT-40291",
        meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"] },
        identifier: [{ system: "urn:mrn", value: "40291" }],
        name: [{ family: "Delgado", given: ["Marcus"] }],
      },
    };
    const profile = deriveUsCoreChecks(withMeta).find((c) => c.rule === "Profile");
    expect(profile?.kind).toBe("ok");
    expect(profile?.detail).toContain("meta.profile");
  });

  it("never under-reports — the worst check is at least the declared valid state", () => {
    const checkRank = { ok: 0, warn: 1, err: 2 } as const;
    const validRank = { pass: 0, warn: 1, err: 2 } as const;
    for (const r of all) {
      const worst = deriveUsCoreChecks(r).reduce(
        (m, c) => Math.max(m, checkRank[c.kind]),
        0,
      );
      expect(worst).toBeGreaterThanOrEqual(validRank[r.valid]);
    }
  });
});

describe("resolveRelatedTarget", () => {
  it("follows a subject reference to the real Patient (by embedded json.id)", () => {
    const tgt = resolveRelatedTarget(observation, observation.related[0], all);
    expect(tgt?.id).toBe("pat-1");
  });

  it("is inert when no resource of the related type is loaded (Patient→Condition)", () => {
    const tgt = resolveRelatedTarget(patient, patient.related[1], all);
    expect(tgt).toBeNull();
  });

  it("returns null for an unloaded related resource type", () => {
    const diagChip = observation.related[1]; // DiagnosticReport
    expect(resolveRelatedTarget(observation, diagChip, all)).toBeNull();
  });

  it("never resolves a chip back to its own source node", () => {
    const self = resolveRelatedTarget(medErr, medErr.related[0], all);
    expect(self?.id).not.toBe(medErr.id);
  });

  it("prefers same-patient candidates over cross-patient ones", () => {
    const condMarcus: FhirResource = { ...patient, id: "cond-m", type: "Condition", patient: "Marcus Delgado", label: "Type 2 diabetes" };
    const condAndre: FhirResource = { ...patient, id: "cond-a", type: "Condition", patient: "Andre Boucher", label: "Hypertension" };
    const tgt = resolveRelatedTarget(patient, { t: "Condition", l: "3 active" }, [patient, condAndre, condMarcus]);
    expect(tgt?.patient).toBe("Marcus Delgado");
  });
});

describe("collapsedSummary", () => {
  it("summarizes objects by field count, dropping undefined", () => {
    expect(collapsedSummary({ a: 1, b: 2, c: undefined })).toBe("{ … 2 fields }");
    expect(collapsedSummary({ a: 1 })).toBe("{ … 1 field }");
  });

  it("summarizes arrays by item count", () => {
    expect(collapsedSummary([1, 2, 3])).toBe("[ … 3 items ]");
    expect(collapsedSummary(["only"])).toBe("[ … 1 item ]");
  });
});
