import { describe, expect, it } from "vitest";
import {
  buildOverrideAudit,
  runContraindicationCheck,
  validateOverride,
} from "./contraindication-check";

describe("runContraindicationCheck", () => {
  it("returns a clear gate for a patient with no flags", () => {
    const r = runContraindicationCheck({
      icd10Codes: ["M54.12"],
      historyText: "Chronic neck pain.",
    });
    expect(r.gate).toBe("clear");
    expect(r.matches).toEqual([]);
    expect(r.overrideRequired).toBe(false);
    expect(r.topSeverity).toBeNull();
  });

  it("blocks when a schizophrenia ICD prefix is present", () => {
    const r = runContraindicationCheck({ icd10Codes: ["F20.9"] });
    expect(r.gate).toBe("block");
    expect(r.topSeverity).toBe("absolute");
    expect(r.overrideRequired).toBe(true);
    expect(r.headline).toMatch(/Absolute contraindication/);
  });

  it("blocks on pregnancy keyword in free-text history", () => {
    const r = runContraindicationCheck({
      historyText: "Patient is currently pregnant, third trimester.",
    });
    expect(r.gate).toBe("block");
    expect(r.matches[0].contraindication.id).toBe("pregnancy");
  });

  it("warns for relative-severity flags (e.g. severe CV disease)", () => {
    const r = runContraindicationCheck({
      historyText: "History of recent MI and unstable angina.",
    });
    // CV disease is "relative" — should warn, not block.
    expect(r.gate).toBe("warn");
    expect(r.topSeverity).toBe("relative");
  });

  it("ranks absolute above relative when both are present", () => {
    const r = runContraindicationCheck({
      icd10Codes: ["F20.9", "I25.10"],
      historyText: "Recent MI.",
    });
    expect(r.gate).toBe("block");
    expect(r.matches[0].contraindication.severity).toBe("absolute");
  });

  it("surfaces a multi-flag count in the headline", () => {
    const r = runContraindicationCheck({
      icd10Codes: ["F20.9", "F31.0"],
    });
    expect(r.headline).toMatch(/\+1 more/);
  });
});

describe("validateOverride", () => {
  const blocking = runContraindicationCheck({ icd10Codes: ["F20.9"] });

  it("approves a clear check trivially", () => {
    const r = validateOverride(
      {
        reason: "",
        clinicianAttestation: "",
        patientCounseledAcknowledged: false,
        alternativesConsideredAcknowledged: false,
      },
      runContraindicationCheck({}),
    );
    expect(r.ok).toBe(true);
  });

  it("rejects a too-short reason", () => {
    const r = validateOverride(
      {
        reason: "fine",
        clinicianAttestation: "Dr. Park",
        patientCounseledAcknowledged: true,
        alternativesConsideredAcknowledged: true,
      },
      blocking,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/at least 30 characters/);
  });

  it("requires the clinician attestation", () => {
    const r = validateOverride(
      {
        reason:
          "Patient has stable schizophrenia on clozapine; risk of pain non-treatment outweighs cannabis risk.",
        clinicianAttestation: "",
        patientCounseledAcknowledged: true,
        alternativesConsideredAcknowledged: true,
      },
      blocking,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/attestation/);
  });

  it("requires both acknowledgement checkboxes", () => {
    const r = validateOverride(
      {
        reason:
          "Patient with schizophrenia has stable mood on clozapine. Long discussion with patient.",
        clinicianAttestation: "Dr. Park",
        patientCounseledAcknowledged: false,
        alternativesConsideredAcknowledged: false,
      },
      blocking,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("requires the reason to reference the flag keyword for absolute contraindications", () => {
    const r = validateOverride(
      {
        // 30+ chars but no mention of "schizophrenia" or related keyword.
        reason:
          "Risk benefit weighed. Continuing with prescribing per shared decision-making.",
        clinicianAttestation: "Dr. Park",
        patientCounseledAcknowledged: true,
        alternativesConsideredAcknowledged: true,
      },
      blocking,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/reference the specific flagged condition/);
  });

  it("accepts a complete override on an absolute contraindication", () => {
    const r = validateOverride(
      {
        reason:
          "Patient with schizophrenia has been stable on clozapine for 4 years; pain is severe and untreated alternatives exhausted.",
        clinicianAttestation: "Dr. Park",
        patientCounseledAcknowledged: true,
        alternativesConsideredAcknowledged: true,
      },
      blocking,
    );
    expect(r.ok).toBe(true);
  });
});

describe("buildOverrideAudit", () => {
  it("captures the severity, matched flags, and attestation", () => {
    const check = runContraindicationCheck({ icd10Codes: ["F20.9"] });
    const audit = buildOverrideAudit(
      {
        reason:
          "Patient with schizophrenia stable on clozapine; pain severe and alternatives tried.",
        clinicianAttestation: "Dr. Park",
        patientCounseledAcknowledged: true,
        alternativesConsideredAcknowledged: true,
      },
      check,
    );
    expect(audit.action).toBe("rx.contraindication.override");
    expect(audit.severity).toBe("absolute");
    expect(audit.contraindicationIds).toContain("schizophrenia");
    expect(audit.matchedOn[0]).toMatch(/ICD-10 F20\.9/);
    expect(audit.acknowledgements.patientCounseled).toBe(true);
  });

  it("throws when called on a clear check", () => {
    const clear = runContraindicationCheck({});
    expect(() =>
      buildOverrideAudit(
        {
          reason: "—",
          clinicianAttestation: "—",
          patientCounseledAcknowledged: true,
          alternativesConsideredAcknowledged: true,
        },
        clear,
      ),
    ).toThrow(/clear check/);
  });
});
