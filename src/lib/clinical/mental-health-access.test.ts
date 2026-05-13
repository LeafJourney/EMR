import { describe, expect, it } from "vitest";
import {
  buildAccessAudit,
  classifySensitivity,
  decideAccess,
  type AccessAttempt,
  type BreakGlassAttestation,
} from "./mental-health-access";

const VALID_ATTESTATION: BreakGlassAttestation = {
  reason:
    "Patient is being co-managed for chronic pain; need access to behavioral-health plan to reconcile medications.",
  clinicianAttestation: "Dr. Helen Park",
  acknowledgedClinicalPurpose: true,
  acknowledgedRedisclosureRules: true,
};

describe("classifySensitivity", () => {
  it("flags substance-use ICD codes (42 CFR Part 2)", () => {
    const c = classifySensitivity({ icd10Codes: ["F11.20"] });
    expect(c.isSensitive).toBe(true);
    expect(c.categories).toContain("substance_use");
    expect(c.primary).toBe("substance_use");
  });

  it("flags psychotherapy note types via CPT codes", () => {
    const c = classifySensitivity({ cptCodes: ["90837"] });
    expect(c.primary).toBe("psychotherapy_notes");
  });

  it("flags suicidal-ideation language", () => {
    const c = classifySensitivity({
      text: "Patient verbalized that she wants to die.",
    });
    expect(c.categories).toContain("suicidal_ideation");
  });

  it("ranks psychotherapy notes above substance use (precedence)", () => {
    const c = classifySensitivity({
      icd10Codes: ["F11.20"],
      cptCodes: ["90837"],
    });
    expect(c.primary).toBe("psychotherapy_notes");
  });

  it("flags reproductive-care ICD prefix O04", () => {
    const c = classifySensitivity({ icd10Codes: ["O04.5"] });
    expect(c.categories).toContain("reproductive_care");
  });

  it("returns empty classification for a routine note", () => {
    const c = classifySensitivity({
      noteType: "follow_up",
      text: "Blood pressure improved on lisinopril.",
      icd10Codes: ["I10"],
    });
    expect(c.isSensitive).toBe(false);
    expect(c.categories).toEqual([]);
    expect(c.primary).toBeNull();
  });

  it("respects an explicit flaggedConfidential override", () => {
    const c = classifySensitivity({ flaggedConfidential: true });
    expect(c.isSensitive).toBe(true);
    expect(c.categories).toContain("general_mental_health");
  });
});

describe("decideAccess", () => {
  const sudClass = classifySensitivity({ icd10Codes: ["F11.20"] });
  const pyschoClass = classifySensitivity({ cptCodes: ["90837"] });
  const generalMh = classifySensitivity({ icd10Codes: ["F32.1"] });

  it("allows access to non-sensitive records without a wall", () => {
    const r = decideAccess(classifySensitivity({}), {
      viewerRole: "ma_or_front_desk",
    });
    expect(r.kind).toBe("allow");
  });

  it("lets a treating clinician through with no e-signature", () => {
    const r = decideAccess(generalMh, {
      viewerRole: "treating_clinician",
      hasTreatmentRelationship: true,
    });
    expect(r.kind).toBe("allow");
  });

  it("walls off non-treating clinicians until they break-glass", () => {
    const r = decideAccess(generalMh, { viewerRole: "covering_clinician" });
    expect(r.kind).toBe("wall");
  });

  it("denies billing access to SUD records (42 CFR Part 2)", () => {
    const r = decideAccess(sudClass, {
      viewerRole: "billing_or_back_office",
    });
    expect(r.kind).toBe("deny");
  });

  it("denies external viewers — they must go through ROI", () => {
    const r = decideAccess(generalMh, { viewerRole: "external" });
    expect(r.kind).toBe("deny");
  });

  it("allows patients to view their own non-process records", () => {
    const r = decideAccess(generalMh, {
      viewerRole: "patient_self",
      isViewingOwnRecord: true,
    });
    expect(r.kind).toBe("allow");
  });

  it("denies patients access to their own psychotherapy process notes", () => {
    const r = decideAccess(pyschoClass, {
      viewerRole: "patient_self",
      isViewingOwnRecord: true,
    });
    expect(r.kind).toBe("deny");
  });

  it("accepts a complete break-glass attestation for a covering clinician", () => {
    const r = decideAccess(generalMh, {
      viewerRole: "covering_clinician",
      breakGlassAttestation: VALID_ATTESTATION,
    });
    expect(r.kind).toBe("allow");
  });

  it("re-walls when the break-glass reason is too short", () => {
    const r = decideAccess(generalMh, {
      viewerRole: "covering_clinician",
      breakGlassAttestation: { ...VALID_ATTESTATION, reason: "covering" },
    });
    expect(r.kind).toBe("wall");
  });

  it("re-walls when acknowledgements are not checked", () => {
    const r = decideAccess(generalMh, {
      viewerRole: "covering_clinician",
      breakGlassAttestation: {
        ...VALID_ATTESTATION,
        acknowledgedClinicalPurpose: false,
      },
    });
    expect(r.kind).toBe("wall");
  });
});

describe("buildAccessAudit", () => {
  const sudClass = classifySensitivity({ icd10Codes: ["F11.20"] });

  it("uses the break_glass action when allow + attestation are both present", () => {
    const attempt: AccessAttempt = {
      viewerRole: "covering_clinician",
      breakGlassAttestation: VALID_ATTESTATION,
    };
    const decision = decideAccess(sudClass, attempt);
    const audit = buildAccessAudit(sudClass, attempt, {
      type: "Note",
      id: "note_1",
      patientId: "p_1",
      viewerUserId: "u_1",
    }, decision);
    expect(audit.action).toBe("phi.sensitive.break_glass");
    expect(audit.outcome).toBe("allowed");
    expect(audit.breakGlass?.clinicianAttestation).toBe("Dr. Helen Park");
  });

  it("uses the viewed action when no attestation was supplied", () => {
    const attempt: AccessAttempt = {
      viewerRole: "treating_clinician",
      hasTreatmentRelationship: true,
    };
    const decision = decideAccess(sudClass, attempt);
    const audit = buildAccessAudit(sudClass, attempt, {
      type: "Note",
      id: "note_1",
      patientId: "p_1",
      viewerUserId: "u_1",
    }, decision);
    expect(audit.action).toBe("phi.sensitive.viewed");
    expect(audit.outcome).toBe("allowed");
    expect(audit.breakGlass).toBeUndefined();
  });

  it("records 'blocked' outcome when the wall fired", () => {
    const attempt: AccessAttempt = {
      viewerRole: "covering_clinician",
    };
    const decision = decideAccess(sudClass, attempt);
    const audit = buildAccessAudit(sudClass, attempt, {
      type: "Note",
      id: "note_1",
      patientId: "p_1",
      viewerUserId: "u_1",
    }, decision);
    expect(audit.outcome).toBe("blocked");
  });
});
