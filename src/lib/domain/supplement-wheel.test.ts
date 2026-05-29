import { describe, expect, it } from "vitest";
import {
  BUILTIN_SUPPLEMENTS,
  ratingFromEvidence,
  starBreakdown,
  symptomOverlap,
} from "./supplement-wheel";

describe("ratingFromEvidence", () => {
  it("maps evidence bands to 1-5 stars", () => {
    expect(ratingFromEvidence("strong")).toBe(5);
    expect(ratingFromEvidence("moderate")).toBe(4);
    expect(ratingFromEvidence("emerging")).toBe(3);
  });
});

describe("starBreakdown", () => {
  it("splits whole ratings into full + empty", () => {
    expect(starBreakdown(5)).toEqual({ full: 5, half: 0, empty: 0 });
    expect(starBreakdown(3)).toEqual({ full: 3, half: 0, empty: 2 });
  });

  it("renders a half star for fractional ratings", () => {
    expect(starBreakdown(4.5)).toEqual({ full: 4, half: 1, empty: 0 });
    expect(starBreakdown(2.5)).toEqual({ full: 2, half: 1, empty: 2 });
  });

  it("clamps out-of-range ratings", () => {
    expect(starBreakdown(7)).toEqual({ full: 5, half: 0, empty: 0 });
    expect(starBreakdown(-1)).toEqual({ full: 0, half: 0, empty: 5 });
  });
});

describe("BUILTIN_SUPPLEMENTS", () => {
  it("every supplement carries a rating and at least one article", () => {
    for (const s of BUILTIN_SUPPLEMENTS) {
      expect(s.rating).toBeGreaterThanOrEqual(1);
      expect(s.rating).toBeLessThanOrEqual(5);
      expect(s.articles.length).toBeGreaterThan(0);
      for (const a of s.articles) {
        expect(a.url).toMatch(/^https:\/\//);
      }
    }
  });
});

describe("symptomOverlap", () => {
  it("counts shared symptoms across a stack", () => {
    const mag = BUILTIN_SUPPLEMENTS.find((s) => s.id === "magnesium-glycinate")!;
    const theanine = BUILTIN_SUPPLEMENTS.find((s) => s.id === "l-theanine")!;
    const overlap = symptomOverlap([mag, theanine]);
    const anxiety = overlap.find((o) => o.symptom === "anxiety");
    expect(anxiety?.count).toBe(2);
  });
});
