import { describe, it, expect } from "vitest";
import {
  bubbleClass,
  severityFromInterpretation,
  severityFromScore,
  normalityTone,
  identityColor,
  stableHash,
  initialsOf,
  sexColorKey,
  SEX_BUBBLE_CLASSES,
} from "./chart-bubbles";

describe("bubble taxonomy", () => {
  it("returns a class string for every tone", () => {
    for (const tone of ["normal", "mild", "moderate", "severe", "ratio", "active", "inactive", "beige", "info"] as const) {
      expect(bubbleClass(tone)).toMatch(/bg-/);
    }
  });
});

describe("severityFromInterpretation", () => {
  it("bands common interpretation strings", () => {
    expect(severityFromInterpretation("Severe anxiety")).toBe("severe");
    expect(severityFromInterpretation("Moderate depression")).toBe("moderate");
    expect(severityFromInterpretation("Mild")).toBe("mild");
    expect(severityFromInterpretation("None / minimal")).toBe("normal");
    expect(severityFromInterpretation(null)).toBe("normal");
  });
});

describe("severityFromScore", () => {
  const cutoffs = { mild: 5, moderate: 10, severe: 15 };
  it("bands scores against ascending cutoffs", () => {
    expect(severityFromScore(2, cutoffs)).toBe("normal");
    expect(severityFromScore(6, cutoffs)).toBe("mild");
    expect(severityFromScore(12, cutoffs)).toBe("moderate");
    expect(severityFromScore(20, cutoffs)).toBe("severe");
    expect(severityFromScore(null, cutoffs)).toBe("normal");
  });
});

describe("normalityTone", () => {
  it("maps abnormal → severe, normal → normal", () => {
    expect(normalityTone(true)).toBe("severe");
    expect(normalityTone(false)).toBe("normal");
  });
});

describe("identity colours (EMR-897)", () => {
  it("is deterministic for a given seed", () => {
    expect(identityColor("user-123")).toEqual(identityColor("user-123"));
  });
  it("produces a stable unsigned hash", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).toBeGreaterThanOrEqual(0);
  });
  it("returns a usable palette slot with an emoji", () => {
    const c = identityColor("dana-okafor");
    expect(c.emoji.length).toBeGreaterThan(0);
    expect(c.bg).toMatch(/bg-/);
  });
});

describe("initialsOf", () => {
  it("derives initials from names", () => {
    expect(initialsOf("Dana Okafor")).toBe("DO");
    expect(initialsOf("Maya")).toBe("MA");
    expect(initialsOf("  ")).toBe("??");
  });
});

describe("sex-keyed demographic bubble (EMR-849)", () => {
  it("maps sex strings to colour keys", () => {
    expect(sexColorKey("Female")).toBe("female");
    expect(sexColorKey("M")).toBe("male");
    expect(sexColorKey("unknown")).toBe("neutral");
    expect(SEX_BUBBLE_CLASSES.female).toMatch(/pink/);
    expect(SEX_BUBBLE_CLASSES.male).toMatch(/blue/);
  });
});
