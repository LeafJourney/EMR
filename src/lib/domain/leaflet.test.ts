import { describe, it, expect } from "vitest";
import {
  extractActionItems,
  formatVisitModality,
  sanitizeReason,
  buildDeterministicNarrative,
  type LeafletData,
} from "./leaflet";

describe("extractActionItems", () => {
  it("splits a prose plan into sentences instead of dropping it", () => {
    // A single-paragraph plan used to yield ZERO items (the >200-char line was
    // filtered out), forcing the caller's contradictory "Continue current care
    // plan" fallback.
    const plan =
      "Start high-CBD 20:1 tincture, 1 mL sublingual BID. Increase levothyroxine dose pending today's TSH review. Reinforce headache diary. Expect 4 weeks to assess migraine frequency trend.";
    const items = extractActionItems(plan);
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items[0]).toMatch(/high-CBD/i);
    expect(items.some((i) => /levothyroxine/i.test(i))).toBe(true);
  });

  it("honors explicit bullet lines", () => {
    const plan = "- Titrate THC at night\n- RTC in 4 weeks\n- Keep a symptom log";
    expect(extractActionItems(plan)).toEqual([
      "Titrate THC at night",
      "RTC in 4 weeks",
      "Keep a symptom log",
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(extractActionItems("")).toEqual([]);
  });
});

describe("formatVisitModality", () => {
  it("humanizes the raw enum", () => {
    expect(formatVisitModality("in_person")).toBe("in-person");
    expect(formatVisitModality("video")).toBe("video");
    expect(formatVisitModality("phone")).toBe("phone");
  });
});

describe("sanitizeReason", () => {
  it("strips un-interpolated template placeholders", () => {
    expect(sanitizeReason("[visit type: history & physical]")).toBeNull();
    expect(sanitizeReason("follow-up [tag] visit")).toBe("follow-up visit");
  });
  it("passes through clean reasons", () => {
    expect(sanitizeReason("migraine follow-up")).toBe("migraine follow-up");
  });
});

describe("buildDeterministicNarrative", () => {
  const base: LeafletData = {
    patientName: "Sarah Thompson",
    patientDOB: null,
    allergies: [],
    visit: { date: "Jun 7, 2026", provider: "Dr. Okafor", modality: "in_person", reason: null },
    discussed: "",
    carePlan: [],
    carePlanNotes: "",
    nextSteps: [],
    followUp: "RTC in 4 weeks.",
    narrativeSource: "",
    generatedAt: "2026-06-07T00:00:00.000Z",
  };

  it("never leaks the raw modality enum or a wrong article", () => {
    const out = buildDeterministicNarrative(base);
    expect(out).not.toMatch(/in_person/);
    expect(out).toContain("an in-person visit");
  });

  it("never leaks a bracketed placeholder reason", () => {
    const out = buildDeterministicNarrative({
      ...base,
      visit: { ...base.visit, reason: "[visit type: history & physical]" },
    });
    expect(out).not.toMatch(/\[/);
  });
});
