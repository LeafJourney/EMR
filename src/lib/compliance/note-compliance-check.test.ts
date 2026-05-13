import { describe, expect, it } from "vitest";
import {
  checkNoteCompliance,
  summarizeBatch,
  type NoteForComplianceCheck,
} from "./note-compliance-check";

function note(over: Partial<NoteForComplianceCheck>): NoteForComplianceCheck {
  return {
    noteId: "n_" + Math.random().toString(36).slice(2, 8),
    noteType: "office_visit",
    chiefComplaint: "Chronic neck pain — follow up",
    hpi: "Patient reports pain stable on current regimen.",
    exam: "Neck: tender to palpation at C5-6, ROM mildly reduced.",
    assessment:
      "Cervical radiculopathy stable. Continue current cannabis tincture regimen.",
    icd10Codes: ["M54.12"],
    cptCodes: ["99213"],
    mdmLevel: "moderate",
    signed: true,
    signedAt: "2026-05-01T13:00:00Z",
    encounterAt: "2026-05-01T12:00:00Z",
    treatmentPlanDocumented: true,
    patientCounseled: true,
    controlledSubstancePrescribed: false,
    pdmpQueried: null,
    ...over,
  };
}

describe("checkNoteCompliance", () => {
  it("passes for a well-formed office visit note", () => {
    const r = checkNoteCompliance(note({}));
    expect(r.findings).toEqual([]);
    expect(r.passes).toBe(true);
    expect(r.topSeverity).toBeNull();
  });

  it("flags missing chief complaint as critical", () => {
    const r = checkNoteCompliance(note({ chiefComplaint: "" }));
    const f = r.findings.find((x) => x.id === "jc.rc01.cc");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("critical");
    expect(r.passes).toBe(false);
  });

  it("flags missing assessment as critical", () => {
    const r = checkNoteCompliance(note({ assessment: "ok" }));
    expect(r.findings.some((f) => f.id === "cms.em.assessment")).toBe(true);
  });

  it("flags missing ICD-10 codes as critical", () => {
    const r = checkNoteCompliance(note({ icd10Codes: [] }));
    expect(r.findings.some((f) => f.id === "cms.diagnosis.code")).toBe(true);
  });

  it("warns when high-complexity CPT is billed but MDM is low", () => {
    const r = checkNoteCompliance(
      note({ cptCodes: ["99215"], mdmLevel: "low" }),
    );
    const f = r.findings.find((x) => x.id === "cms.em.mdm-mismatch");
    expect(f?.severity).toBe("warning");
  });

  it("does NOT warn when MDM matches the billed level", () => {
    const r = checkNoteCompliance(
      note({ cptCodes: ["99215"], mdmLevel: "high" }),
    );
    expect(r.findings.some((f) => f.id === "cms.em.mdm-mismatch")).toBe(false);
  });

  it("flags controlled-substance Rx without PDMP query as critical", () => {
    const r = checkNoteCompliance(
      note({ controlledSubstancePrescribed: true, pdmpQueried: false }),
    );
    expect(r.findings.some((f) => f.id === "cms.pdmp")).toBe(true);
  });

  it("warns when controlled substance is prescribed alongside SUD diagnosis", () => {
    const r = checkNoteCompliance(
      note({
        controlledSubstancePrescribed: true,
        pdmpQueried: true,
        icd10Codes: ["F11.20"],
      }),
    );
    expect(r.findings.some((f) => f.id === "cms.sud-controlled")).toBe(true);
  });

  it("flags unsigned notes as critical", () => {
    const r = checkNoteCompliance(note({ signed: false, signedAt: null }));
    expect(r.findings.some((f) => f.id === "jc.rc02.signed")).toBe(true);
  });

  it("warns when signing is more than 24h after the encounter", () => {
    const r = checkNoteCompliance(
      note({
        encounterAt: "2026-05-01T08:00:00Z",
        signedAt: "2026-05-03T08:00:00Z",
      }),
    );
    expect(r.findings.some((f) => f.id === "cms.482.24.signing-window")).toBe(
      true,
    );
  });

  it("does NOT warn for same-day signing within 24h", () => {
    const r = checkNoteCompliance(
      note({
        encounterAt: "2026-05-01T08:00:00Z",
        signedAt: "2026-05-01T22:00:00Z",
      }),
    );
    expect(r.findings.some((f) => f.id === "cms.482.24.signing-window")).toBe(
      false,
    );
  });

  it("orders findings critical -> warning -> info", () => {
    const r = checkNoteCompliance(
      note({
        chiefComplaint: "",
        cptCodes: ["99215"],
        mdmLevel: "low",
        patientCounseled: false,
      }),
    );
    const sev = r.findings.map((f) => f.severity);
    expect(sev.indexOf("critical")).toBeLessThan(sev.indexOf("warning"));
    expect(sev.indexOf("warning")).toBeLessThan(sev.indexOf("info"));
  });
});

describe("summarizeBatch", () => {
  it("aggregates rule counts across reports", () => {
    const r1 = checkNoteCompliance(note({ chiefComplaint: "" }));
    const r2 = checkNoteCompliance(note({ chiefComplaint: "" }));
    const r3 = checkNoteCompliance(note({}));
    const summary = summarizeBatch([r1, r2, r3]);
    expect(summary.notesScanned).toBe(3);
    expect(summary.notesWithFindings).toBe(2);
    expect(summary.notesWithCritical).toBe(2);
    const cc = summary.byRule.find((r) => r.ruleId === "jc.rc01.cc");
    expect(cc?.count).toBe(2);
  });

  it("orders rules critical first, then by count", () => {
    const r1 = checkNoteCompliance(note({ patientCounseled: false }));
    const r2 = checkNoteCompliance(note({ chiefComplaint: "" }));
    const summary = summarizeBatch([r1, r2]);
    expect(summary.byRule[0].severity).toBe("critical");
  });
});
