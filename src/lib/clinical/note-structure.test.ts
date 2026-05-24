import { describe, it, expect } from "vitest";
import {
  isAcuteAssessmentInBand,
  parseVitalsRepeatReading,
  renderVitalsRepeatReading,
  shouldMergeAssessmentAndPlan,
  suggestIcd10ForProblem,
  summarizeAcuteHpi,
} from "./note-structure";

describe("note structure (EMR-704)", () => {
  describe("ICD-10 capture per problem", () => {
    it("maps the four Maya Reyes problems to canonical codes", () => {
      expect(suggestIcd10ForProblem("Essential Hypertension")).toBe("I10");
      expect(suggestIcd10ForProblem("Type 2 DM without complications")).toBe("E11.9");
      expect(suggestIcd10ForProblem("Hyperlipidemia")).toBe("E78.00");
      expect(suggestIcd10ForProblem("L Shoulder Pain")).toBe("M25.512");
    });

    it("returns null on a problem the registry doesn't know", () => {
      expect(suggestIcd10ForProblem("zebra disease")).toBe(null);
    });
  });

  describe("A+P merge rule", () => {
    it("merges every chronic condition", () => {
      expect(shouldMergeAssessmentAndPlan({ acuity: "chronic" })).toBe(true);
    });

    it("merges any acute condition that still carries an ICD-10 code", () => {
      expect(
        shouldMergeAssessmentAndPlan({ acuity: "acute", icd10: "M25.512" }),
      ).toBe(true);
    });

    it("keeps acute, uncoded conditions in standard SOAP order", () => {
      expect(shouldMergeAssessmentAndPlan({ acuity: "acute" })).toBe(false);
    });

    it("per-note override beats the default rule both ways", () => {
      expect(
        shouldMergeAssessmentAndPlan({ acuity: "chronic", forceMerge: false }),
      ).toBe(false);
      expect(
        shouldMergeAssessmentAndPlan({ acuity: "acute", forceMerge: true }),
      ).toBe(true);
    });
  });

  describe("vitals repeat-reading parser", () => {
    it("parses the Maya Reyes BP repeat line", () => {
      const parsed = parseVitalsRepeatReading(
        "134/82 >> (repeat) 120/80 (Right arm, sitting)",
      );
      expect(parsed).toEqual({
        original: "134/82",
        repeat: "120/80",
        modifier: "Right arm, sitting",
      });
    });

    it("parses a plain single-value line", () => {
      const parsed = parseVitalsRepeatReading("72");
      expect(parsed).toEqual({ original: "72", repeat: null, modifier: null });
    });

    it("round-trips through parse → render", () => {
      const src = "134/82 >> (repeat) 120/80 (Right arm, sitting)";
      const parsed = parseVitalsRepeatReading(src)!;
      expect(renderVitalsRepeatReading(parsed)).toBe(src);
    });
  });

  describe("acute-issue Assessment summary", () => {
    it("produces a 5-10 word Assessment for the Maya Reyes shoulder HPI", () => {
      const hpi =
        "One week of L shoulder pain after playing pickleball last Sunday. Pain 5/10 with overhead reach.";
      const summary = summarizeAcuteHpi(hpi);
      expect(isAcuteAssessmentInBand(summary)).toBe(true);
      expect(summary.toLowerCase()).toContain("shoulder pain");
      expect(summary.toLowerCase()).toContain("pickleball");
    });

    it("isAcuteAssessmentInBand rejects too-long or too-short lines", () => {
      expect(isAcuteAssessmentInBand("Pt has cough")).toBe(false);
      expect(
        isAcuteAssessmentInBand(
          "Pt with twelve words now exceeds the upper bound for an acute summary band line",
        ),
      ).toBe(false);
    });
  });
});
