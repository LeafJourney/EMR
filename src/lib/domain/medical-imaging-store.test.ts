import { describe, it, expect } from "vitest";
import { listStudies, upsertStudy } from "./medical-imaging-store";
import type { ImagingStudy } from "./medical-imaging";

function study(id: string, patientId: string): ImagingStudy {
  return {
    id,
    patientId,
    modality: "CT",
    description: `Study ${id}`,
    bodyPart: "Chest",
    studyDate: "2026-05-20",
    status: "final",
    series: [],
  };
}

// EMR-806: the patient portal must only ever show studies belonging to the
// signed-in patient. `listStudies(patientId)` is the scoping primitive the
// portal pages now rely on, so guard its filtering directly.
describe("listStudies patient scoping", () => {
  it("returns only the requested patient's studies", () => {
    upsertStudy(study("scope-a1", "patient-A"));
    upsertStudy(study("scope-a2", "patient-A"));
    upsertStudy(study("scope-b1", "patient-B"));

    const a = listStudies("patient-A");
    expect(a.map((s) => s.id).sort()).toEqual(["scope-a1", "scope-a2"]);
    expect(a.every((s) => s.patientId === "patient-A")).toBe(true);
  });

  it("never leaks another patient's studies", () => {
    upsertStudy(study("scope-a1", "patient-A"));
    const b = listStudies("patient-B");
    expect(b.some((s) => s.patientId === "patient-A")).toBe(false);
  });

  it("returns an empty list for a patient with no studies", () => {
    expect(listStudies("patient-with-nothing")).toEqual([]);
  });
});
