import { describe, expect, it } from "vitest";

import {
  deriveVisitType,
  evaluatePrevisitReadiness,
  mapSnapshotToGateInput,
  missingBlockingRequirements,
  type PrevisitSnapshot,
} from "./previsit-readiness";

const NOW = new Date("2026-06-01T12:00:00.000Z");

function fullSnapshot(overrides: Partial<PrevisitSnapshot> = {}): PrevisitSnapshot {
  return {
    visitType: "new_patient",
    treatmentPhase: "intake",
    isVirtual: false,
    patient: {
      dateOfBirth: new Date("1985-04-12T00:00:00.000Z"),
      addressLine1: "1 Main St",
      state: "CA",
      ageVerifiedAt: new Date("2026-05-01T00:00:00.000Z"),
      allergiesScreenedAt: new Date("2026-05-02T00:00:00.000Z"),
      cannabisHistory: { priorUse: "occasional" },
      presentingConcerns: "Chronic lower back pain for 6 months",
      intakeAnswers: { done: true },
    },
    consents: [
      { templateName: "Visit Consent", version: "1.0", signedAt: new Date("2026-05-10T00:00:00.000Z") },
    ],
    coverages: [
      { type: "primary", active: true, eligibilityStatus: "active" },
    ],
    selfPayAttested: false,
    outcomeLogsSinceLastVisit: 0,
    ...overrides,
  };
}

describe("deriveVisitType", () => {
  it("treats a patient with no completed encounters as new_patient", () => {
    expect(deriveVisitType(0)).toBe("new_patient");
  });

  it("treats a patient with at least one completed encounter as follow_up", () => {
    expect(deriveVisitType(1)).toBe("follow_up");
    expect(deriveVisitType(7)).toBe("follow_up");
  });
});

describe("mapSnapshotToGateInput", () => {
  it("derives visit consent date from a matching signed consent", () => {
    const input = mapSnapshotToGateInput(fullSnapshot());
    expect(input.consent.visitConsentSignedAt).toEqual(new Date("2026-05-10T00:00:00.000Z"));
    expect(input.consent.telehealthConsentSignedAt).toBeNull();
  });

  it("derives telehealth consent only from a telehealth-classified consent", () => {
    const input = mapSnapshotToGateInput(
      fullSnapshot({
        isVirtual: true,
        consents: [
          { templateName: "Visit Consent", version: "1.0", signedAt: new Date("2026-05-10T00:00:00.000Z") },
          { templateName: "Telehealth Informed Consent", version: "2.0", signedAt: new Date("2026-05-11T00:00:00.000Z") },
        ],
      }),
    );
    expect(input.consent.telehealthConsentSignedAt).toEqual(new Date("2026-05-11T00:00:00.000Z"));
  });

  it("treats an active+eligible coverage as coverageVerified", () => {
    const input = mapSnapshotToGateInput(fullSnapshot());
    expect(input.insurance.coverageVerified).toBe(true);
  });

  it("does not treat an inactive or unverified coverage as verified", () => {
    const input = mapSnapshotToGateInput(
      fullSnapshot({
        coverages: [
          { type: "primary", active: false, eligibilityStatus: "active" },
          { type: "secondary", active: true, eligibilityStatus: "unknown" },
        ],
      }),
    );
    expect(input.insurance.coverageVerified).toBe(false);
  });

  it("passes self-pay attestation through", () => {
    const input = mapSnapshotToGateInput(fullSnapshot({ selfPayAttested: true, coverages: [] }));
    expect(input.insurance.selfPayAttested).toBe(true);
  });
});

describe("missingBlockingRequirements", () => {
  it("is empty for a fully-ready snapshot", () => {
    expect(missingBlockingRequirements(fullSnapshot(), NOW)).toEqual([]);
  });

  it("returns id + label + the gate's resolveHref for each missing blocking item", () => {
    const missing = missingBlockingRequirements(
      fullSnapshot({
        patient: { ...fullSnapshot().patient, presentingConcerns: null, ageVerifiedAt: null },
      }),
      NOW,
    );
    const byId = Object.fromEntries(missing.map((m) => [m.id, m]));
    expect(byId.presenting_concerns).toMatchObject({
      label: "Reason for this visit",
      href: "/patient/intake/concerns",
    });
    expect(byId.id_age_verification).toMatchObject({ href: "/patient/verify" });
  });

  it("excludes non-blocking (advisory) items even when unsatisfied", () => {
    // A titration follow-up with no outcome log => advisory outcome_log is
    // unsatisfied but NOT blocking, so it must not appear here.
    const missing = missingBlockingRequirements(
      fullSnapshot({ visitType: "follow_up", treatmentPhase: "titration", outcomeLogsSinceLastVisit: 0 }),
      NOW,
    );
    expect(missing.some((m) => m.id === "outcome_log_since_last_visit")).toBe(false);
  });
});

describe("evaluatePrevisitReadiness", () => {
  it("is ready when a complete snapshot satisfies every blocking requirement", () => {
    const r = evaluatePrevisitReadiness(fullSnapshot(), NOW);
    expect(r.isReady).toBe(true);
    expect(r.missingRequiredIds).toEqual([]);
    expect(r.completionPct).toBe(1);
  });

  it("reports the blocking requirement ids that are still missing", () => {
    const r = evaluatePrevisitReadiness(
      fullSnapshot({
        patient: {
          ...fullSnapshot().patient,
          presentingConcerns: null,
          ageVerifiedAt: null,
        },
      }),
      NOW,
    );
    expect(r.isReady).toBe(false);
    // presenting_concerns (always blocking) + id_age_verification (blocking for new_patient)
    expect(r.missingRequiredIds).toContain("presenting_concerns");
    expect(r.missingRequiredIds).toContain("id_age_verification");
    expect(r.completionPct).toBeLessThan(1);
  });

  it("exposes a non-PHI summary safe for reminder routing decisions", () => {
    const r = evaluatePrevisitReadiness(
      fullSnapshot({ patient: { ...fullSnapshot().patient, presentingConcerns: null } }),
      NOW,
    );
    // The summary must carry counts/ids only — never patient identifiers.
    expect(JSON.stringify(r)).not.toMatch(/1985|Main St|priorUse|back pain/);
    expect(r.outstandingRequiredCount).toBe(r.missingRequiredIds.length);
  });
});
