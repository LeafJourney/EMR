import { describe, expect, it } from "vitest";
import {
  ASSESSMENTS,
  assessmentBySlug,
  interpretScore,
} from "./assessment-catalog";

// EMR-870 — validated assessment / screener catalog

describe("ASSESSMENTS catalog", () => {
  it("is non-empty and includes the instruments Dr. Patel named", () => {
    expect(ASSESSMENTS.length).toBeGreaterThanOrEqual(14);
    const slugs = ASSESSMENTS.map((a) => a.slug);
    for (const s of ["gad-7", "phq-9", "pain-vas", "gcs", "mmse", "moca", "meld", "audit", "cudit-r", "pcl-5", "ess", "isi"]) {
      expect(slugs).toContain(s);
    }
  });

  it("has well-formed, unique slugs and an emoji on every entry", () => {
    const seen = new Set<string>();
    for (const a of ASSESSMENTS) {
      expect(a.slug).toMatch(/^[a-z0-9-]+$/);
      expect(seen.has(a.slug)).toBe(false);
      seen.add(a.slug);
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.fullName.length).toBeGreaterThan(0);
      expect(a.emoji.length).toBeGreaterThan(0);
    }
  });

  it("keeps cutoffs monotone in the instrument's worse direction", () => {
    for (const a of ASSESSMENTS) {
      if (a.cutoffs) {
        const { mild, moderate, severe } = a.cutoffs;
        if (a.higherIsWorse) {
          // ascending lower bounds: mild <= moderate <= severe
          expect(mild).toBeLessThanOrEqual(moderate);
          expect(moderate).toBeLessThanOrEqual(severe);
        } else {
          // inverted: higher = healthier, so cutoffs descend
          expect(mild).toBeGreaterThanOrEqual(moderate);
          expect(moderate).toBeGreaterThanOrEqual(severe);
        }
      }
    }
  });
});

describe("assessmentBySlug", () => {
  it("resolves a known slug case-insensitively", () => {
    expect(assessmentBySlug("GAD-7")?.title).toBe("GAD-7");
    expect(assessmentBySlug("phq-9")?.fullName).toMatch(/Patient Health/);
  });

  it("returns undefined for an unknown slug", () => {
    expect(assessmentBySlug("not-a-test")).toBeUndefined();
  });
});

describe("interpretScore (higher-is-worse)", () => {
  it("bands GAD-7 across the spectrum", () => {
    const gad = assessmentBySlug("gad-7")!;
    expect(interpretScore(gad, 0).band).toBe("normal");
    expect(interpretScore(gad, 6).band).toBe("mild");
    expect(interpretScore(gad, 12).band).toBe("moderate");
    expect(interpretScore(gad, 18).band).toBe("severe");
    expect(interpretScore(gad, 12).label).toBe("Moderate anxiety");
  });
});

describe("interpretScore (inverted instruments)", () => {
  it("bands MMSE so a high score is normal and a low score is severe", () => {
    const mmse = assessmentBySlug("mmse")!;
    expect(interpretScore(mmse, 29).band).toBe("normal");
    expect(interpretScore(mmse, 20).band).toBe("mild");
    expect(interpretScore(mmse, 12).band).toBe("moderate");
    expect(interpretScore(mmse, 5).band).toBe("severe");
  });
});
