import { describe, it, expect } from "vitest";
import { LakehouseEngine } from "./engine";
import { parseSearchArgs } from "./search-params";
import type { FhirJson, SourceProvenance } from "./types";

const PROV: SourceProvenance = {
  system: "Northbay EHR",
  format: "fhir-r4",
  ingestedAt: "2026-01-01T00:00:00.000Z",
};

function patient(id: string, family: string, given: string, gender: string, birthDate: string): FhirJson {
  return {
    resourceType: "Patient",
    id,
    meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"] },
    identifier: [{ system: "urn:leafjourney:mrn", value: `MRN-${id}` }],
    name: [{ family, given: [given] }],
    gender,
    birthDate,
  };
}

function observation(id: string, patientId: string, loinc: string, when: string, withComponents = false): FhirJson {
  return {
    resourceType: "Observation",
    id,
    meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab"] },
    status: "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }] }],
    code: { coding: [{ system: "http://loinc.org", code: loinc }] },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: when,
    ...(withComponents
      ? { component: [{ code: { text: "sys" } }, { code: { text: "dia" } }] }
      : {}),
  };
}

function fixtureEngine() {
  const eng = new LakehouseEngine({ now: () => new Date("2026-06-01T12:00:00.000Z") });
  eng.ingest("t1", patient("p1", "Reyes", "Lena", "female", "1980-05-01"), PROV);
  eng.ingest("t1", patient("p2", "Okafor", "Sam", "male", "1975-09-12"), PROV);
  eng.ingest("t1", observation("o1", "p1", "4548-4", "2026-03-01"), PROV);
  eng.ingest("t1", observation("o2", "p1", "718-7", "2026-04-15"), PROV);
  eng.ingest("t1", observation("o3", "p2", "4548-4", "2026-02-20"), PROV);
  return eng;
}

describe("LakehouseEngine — write + read", () => {
  it("stores a resource and reads it back with stamped meta", () => {
    const eng = fixtureEngine();
    const p = eng.read("t1", "Patient", "p1");
    expect(p?.id).toBe("p1");
    expect(p?.meta?.versionId).toBe("1");
    expect(p?.meta?.lastUpdated).toBe("2026-06-01T12:00:00.000Z");
  });

  it("scopes reads by tenant — no cross-tenant leak", () => {
    const eng = fixtureEngine();
    expect(eng.read("t2", "Patient", "p1")).toBeNull();
  });

  it("rejects a resource without an id", () => {
    const eng = new LakehouseEngine();
    expect(() => eng.ingest("t1", { resourceType: "Patient" }, PROV)).toThrow(/missing id/);
  });
});

describe("LakehouseEngine — versioning + history", () => {
  it("appends an immutable version on update and keeps prior versions", () => {
    const eng = fixtureEngine();
    eng.ingest("t1", patient("p1", "Reyes-Cole", "Lena", "female", "1980-05-01"), PROV);
    expect(eng.read("t1", "Patient", "p1")?.meta?.versionId).toBe("2");
    expect(eng.vread("t1", "Patient", "p1", "1")?.name).toBeDefined();
    const hist = eng.history("t1", "Patient", "p1");
    expect(hist.map((v) => v.versionId)).toEqual(["2", "1"]); // newest first
  });

  it("tombstones on delete and hides the current read", () => {
    const eng = fixtureEngine();
    expect(eng.remove("t1", "Observation", "o1")).toBe(true);
    expect(eng.read("t1", "Observation", "o1")).toBeNull();
    // version still recoverable via vread
    expect(eng.vread("t1", "Observation", "o1", "1")).not.toBeNull();
  });
});

describe("LakehouseEngine — search", () => {
  it("string search is case-insensitive, starts-with by default", () => {
    const eng = fixtureEngine();
    const r = eng.search("t1", "Patient", parseSearchArgs({ name: "rey" }));
    expect(r.total).toBe(1);
    expect(r.matches[0].id).toBe("p1");
  });

  it("token search matches a coded value", () => {
    const eng = fixtureEngine();
    const r = eng.search("t1", "Observation", parseSearchArgs({ code: "4548-4" }));
    expect(r.total).toBe(2);
  });

  it("reference search resolves bare id and full reference", () => {
    const eng = fixtureEngine();
    expect(eng.search("t1", "Observation", parseSearchArgs({ patient: "p1" })).total).toBe(2);
    expect(eng.search("t1", "Observation", parseSearchArgs({ patient: "Patient/p1" })).total).toBe(2);
  });

  it("date search honors ge/le prefixes", () => {
    const eng = fixtureEngine();
    expect(eng.search("t1", "Observation", parseSearchArgs({ date: "ge2026-03-01" })).total).toBe(2);
    expect(eng.search("t1", "Observation", parseSearchArgs({ date: "lt2026-03-01" })).total).toBe(1);
  });

  it("AND-combines multiple params", () => {
    const eng = fixtureEngine();
    const r = eng.search("t1", "Observation", parseSearchArgs({ patient: "p1", code: "4548-4" }));
    expect(r.total).toBe(1);
    expect(r.matches[0].id).toBe("o1");
  });

  it("paginates with _count/_offset while reporting full total", () => {
    const eng = fixtureEngine();
    const r = eng.search("t1", "Observation", [], { count: 1, offset: 0 });
    expect(r.total).toBe(3);
    expect(r.matches).toHaveLength(1);
  });

  it("excludes tombstoned resources from search", () => {
    const eng = fixtureEngine();
    eng.remove("t1", "Observation", "o1");
    expect(eng.search("t1", "Observation", parseSearchArgs({ code: "4548-4" })).total).toBe(1);
  });
});

describe("LakehouseEngine — $everything", () => {
  it("gathers the patient and all resources in their compartment", () => {
    const eng = fixtureEngine();
    const bundle = eng.everything("t1", "p1");
    expect(bundle[0].resourceType).toBe("Patient");
    expect(bundle.map((r) => r.id).sort()).toEqual(["o1", "o2", "p1"]);
  });
});

describe("LakehouseEngine — catalog + capability", () => {
  it("rolls up zones, types, and conformance", () => {
    const eng = fixtureEngine();
    const cat = eng.catalog("t1");
    expect(cat.totals.resources).toBe(5);
    expect(cat.totals.patients).toBe(2);
    const obs = cat.resourceTypes.find((t) => t.resourceType === "Observation");
    expect(obs?.count).toBe(3);
    const gold = cat.zones.find((z) => z.zone === "gold");
    expect(gold?.rows).toBe(5);
    const audit = cat.zones.find((z) => z.zone === "audit");
    expect(audit?.rows).toBe(eng.auditLog.list("t1").length);
  });

  it("publishes a CapabilityStatement covering present types", () => {
    const eng = fixtureEngine();
    const cap = eng.capabilityStatement("t1");
    const types = ((cap.rest as Array<{ resource: Array<{ type: string }> }>)[0].resource).map((r) => r.type);
    expect(types).toContain("Patient");
    expect(types).toContain("Observation");
  });
});

describe("LakehouseEngine — audit chain", () => {
  it("emits one audit event per write and keeps the chain verifiable", () => {
    const eng = fixtureEngine();
    expect(eng.auditLog.list("t1")).toHaveLength(5);
    expect(eng.auditLog.verify("t1")).toEqual({ ok: true });
  });

  it("detects tampering with a historical entry", () => {
    const eng = fixtureEngine();
    const chain = eng.auditLog.list("t1") as unknown as Array<{ description?: string }>;
    chain[1].description = "tampered";
    expect(eng.auditLog.verify("t1")).toEqual({ ok: false, brokenAt: 2 });
  });
});
