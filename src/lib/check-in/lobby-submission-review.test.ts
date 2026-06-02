import { describe, expect, it } from "vitest";

import {
  parseIntakePayload,
  parseConsentPayload,
  patientUpdateFromIntake,
  intakeHasContent,
} from "./lobby-submission-review";

describe("intakeHasContent", () => {
  it("is false for a wholly-empty intake", () => {
    expect(
      intakeHasContent({
        presentingConcerns: null,
        treatmentGoals: null,
        cannabisHistory: { priorUse: false, formats: [], reportedBenefits: [] },
      }),
    ).toBe(false);
  });
  it("is false when text fields are only whitespace", () => {
    expect(intakeHasContent({ presentingConcerns: "   ", treatmentGoals: "\t" })).toBe(false);
  });
  it("is true when any substantive field is present", () => {
    expect(intakeHasContent({ presentingConcerns: "back pain" })).toBe(true);
    expect(intakeHasContent({ treatmentGoals: "sleep" })).toBe(true);
    expect(intakeHasContent({ cannabisHistory: { priorUse: true } })).toBe(true);
    expect(intakeHasContent({ cannabisHistory: { formats: ["tincture"] } })).toBe(true);
    expect(intakeHasContent({ cannabisHistory: { reportedBenefits: ["calm"] } })).toBe(true);
  });
});

describe("parseIntakePayload", () => {
  it("accepts a well-formed staged intake payload", () => {
    const p = parseIntakePayload({
      presentingConcerns: "back pain",
      treatmentGoals: "sleep better",
      cannabisHistory: { priorUse: true, formats: ["tincture"], reportedBenefits: ["calm"] },
    });
    expect(p?.presentingConcerns).toBe("back pain");
  });
  it("rejects a malformed payload (wrong types)", () => {
    expect(parseIntakePayload({ presentingConcerns: 42 })).toBeNull();
    expect(parseIntakePayload("nope")).toBeNull();
  });
});

describe("patientUpdateFromIntake", () => {
  it("only includes fields the patient actually provided", () => {
    const u = patientUpdateFromIntake({ presentingConcerns: "x" });
    expect(u).toEqual({ presentingConcerns: "x" });
    expect("treatmentGoals" in u).toBe(false);
  });
  it("normalizes cannabisHistory defaults", () => {
    const u = patientUpdateFromIntake({ cannabisHistory: { priorUse: true } });
    expect(u.cannabisHistory).toEqual({ priorUse: true, formats: [], reportedBenefits: [] });
  });
  it("drops empty strings rather than blanking the chart", () => {
    const u = patientUpdateFromIntake({ presentingConcerns: "", treatmentGoals: "" });
    expect(u).toEqual({});
  });
});

describe("parseConsentPayload", () => {
  it("accepts a well-formed staged consent payload", () => {
    const p = parseConsentPayload({
      templateId: "consent-treatment",
      templateName: "General Treatment Consent",
      version: "1.0",
      responses: { f2: true },
      signatureData: "data:image/png;base64,AAAA",
    });
    expect(p?.templateId).toBe("consent-treatment");
  });
  it("rejects a payload missing the template identity", () => {
    expect(parseConsentPayload({ responses: { f2: true } })).toBeNull();
  });
});
