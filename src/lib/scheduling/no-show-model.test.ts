import { describe, expect, it } from "vitest";
import {
  buildFeatures,
  predictNoShow,
  tierPlaybook,
  type NoShowFeatures,
} from "./no-show-model";

const base: NoShowFeatures = {
  priorNoShowRate: 0.15,
  priorVisitCount: 0,
  leadTimeHours: 48,
  distanceMiles: 0,
  isVirtual: true,
  dayOfWeek: 3, // Wednesday
  hourOfDay: 11,
  reminderConfirmed: null,
  daysSinceLastContact: 5,
  insuranceVerified: true,
};

describe("predictNoShow", () => {
  it("scores a default patient in the low tier near the population prior", () => {
    const p = predictNoShow(base);
    expect(p.probability).toBeGreaterThan(0);
    expect(p.probability).toBeLessThan(0.25);
    expect(p.tier).toBe("low");
  });

  it("scores a high-signal patient in the high tier", () => {
    const p = predictNoShow({
      ...base,
      priorNoShowRate: 0.8,
      priorVisitCount: 20,
      reminderConfirmed: false,
      daysSinceLastContact: 120,
      insuranceVerified: false,
      dayOfWeek: 1, // Monday
    });
    expect(p.tier).toBe("high");
    expect(p.probability).toBeGreaterThan(0.45);
  });

  it("treats a confirmed reminder as protective vs. an unconfirmed one", () => {
    const confirmed = predictNoShow({ ...base, reminderConfirmed: true });
    const unconfirmed = predictNoShow({ ...base, reminderConfirmed: false });
    expect(confirmed.probability).toBeLessThan(unconfirmed.probability);
  });

  it("shrinks a thin prior toward the population mean", () => {
    // Same .5 rate, but 2 visits should be pulled toward 0.15 more than 20.
    const thin = predictNoShow({ ...base, priorNoShowRate: 0.5, priorVisitCount: 2 });
    const thick = predictNoShow({ ...base, priorNoShowRate: 0.5, priorVisitCount: 20 });
    expect(thin.probability).toBeLessThan(thick.probability);
  });

  it("returns at most three explanatory factors, ranked by magnitude", () => {
    const p = predictNoShow({
      ...base,
      priorNoShowRate: 0.9,
      priorVisitCount: 30,
      reminderConfirmed: false,
      insuranceVerified: false,
    });
    expect(p.topFactors.length).toBeLessThanOrEqual(3);
    const mags = p.topFactors.map((f) => Math.abs(f.contribution));
    expect(mags).toEqual([...mags].sort((a, b) => b - a));
  });

  it("keeps probabilities inside [0,1] for extreme inputs", () => {
    const p = predictNoShow({
      ...base,
      priorNoShowRate: 1,
      priorVisitCount: 50,
      leadTimeHours: 24 * 365,
      distanceMiles: 500,
      isVirtual: false,
      reminderConfirmed: false,
      daysSinceLastContact: 999,
      insuranceVerified: false,
    });
    expect(p.probability).toBeGreaterThanOrEqual(0);
    expect(p.probability).toBeLessThanOrEqual(1);
  });

  it("rejects out-of-range feature vectors via the schema", () => {
    expect(() => predictNoShow({ ...base, priorNoShowRate: 2 })).toThrow();
    expect(() => predictNoShow({ ...base, hourOfDay: 25 })).toThrow();
  });
});

describe("tierPlaybook", () => {
  it("escalates touches and overbook eligibility with risk", () => {
    expect(tierPlaybook("low")).toEqual({
      remindersToSend: 1,
      requiresLiveConfirm: false,
      eligibleForOverbook: false,
    });
    expect(tierPlaybook("medium").remindersToSend).toBe(2);
    const high = tierPlaybook("high");
    expect(high.remindersToSend).toBe(3);
    expect(high.requiresLiveConfirm).toBe(true);
    expect(high.eligibleForOverbook).toBe(true);
  });
});

describe("buildFeatures", () => {
  it("derives prior rate, lead time, and virtual flag from raw inputs", () => {
    const f = buildFeatures({
      priorVisits: [{ status: "no_show" }, { status: "completed" }, { status: "completed" }, { status: "cancelled" }],
      bookedAt: new Date("2026-05-01T10:00:00.000Z"),
      startAt: new Date("2026-05-03T10:00:00.000Z"),
      distanceMiles: null,
      modality: "video",
      reminderConfirmed: null,
      lastContactAt: null,
      insuranceVerified: false,
    });
    expect(f.priorVisitCount).toBe(4);
    expect(f.priorNoShowRate).toBeCloseTo(0.5, 5); // no_show + cancelled = 2/4
    expect(f.leadTimeHours).toBeCloseTo(48, 5);
    expect(f.isVirtual).toBe(true);
    expect(f.distanceMiles).toBe(0);
    expect(f.daysSinceLastContact).toBe(999);
    expect(f.insuranceVerified).toBe(false);
  });

  it("defaults a brand-new patient to the population prior", () => {
    const f = buildFeatures({
      priorVisits: [],
      bookedAt: new Date("2026-05-01T10:00:00.000Z"),
      startAt: new Date("2026-05-01T12:00:00.000Z"),
      distanceMiles: 10,
      modality: "in_person",
      reminderConfirmed: true,
      lastContactAt: null,
      insuranceVerified: true,
    });
    expect(f.priorNoShowRate).toBe(0.15);
    expect(f.isVirtual).toBe(false);
    expect(f.leadTimeHours).toBeCloseTo(2, 5);
  });
});
