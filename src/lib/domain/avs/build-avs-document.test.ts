import { describe, expect, it } from "vitest";
import { buildAvsDocument } from "./build-avs-document";
import { assertDosesUnchanged, localizeAvsDocument } from "./localization";
import { parseAvsDocument } from "./types";

const baseInput = {
  patientFirstName: "Maria",
  visitDate: "June 13, 2026",
  provider: "Dr. Patel",
  planText: [
    "Start metformin 500 mg by mouth twice daily with meals.",
    "Plan to titrate metformin up to 1000 mg twice daily after two weeks if tolerated.",
    "Begin a 14:10 intermittent fasting schedule.",
    "Walk for 30 minutes daily.",
  ].join("\n"),
  baseNarrative:
    "Today Maria had a follow-up visit. We talked about insulin resistance and started a new medicine.",
  nextSteps: ["Take metformin 500 mg twice daily.", "Log your blood sugar each morning."],
  followUp: "Follow-up in 4 weeks.",
  sourceNote: "Plan: start metformin 500 mg BID, titrate to 1000 mg, 14:10 IF, walk 30 min.",
  now: new Date("2026-06-13T12:00:00.000Z"),
};

describe("buildAvsDocument (English)", () => {
  const doc = buildAvsDocument({ ...baseInput, language: "en" });

  it("validates against the persisted-payload schema", () => {
    expect(() => parseAvsDocument(doc)).not.toThrow();
  });

  it("composes decomposition, a titration calendar, and a roadmap", () => {
    expect(doc.decomposed.medications.length).toBeGreaterThanOrEqual(2);
    expect(doc.calendars).toHaveLength(1);
    expect(doc.calendars[0].steps).toHaveLength(2);
    expect(doc.roadmap.nutrition.length).toBe(1);
    expect(doc.roadmap.behavior.length).toBe(1);
  });

  it("de-jargons insulin resistance in the narrative", () => {
    expect(doc.narrative).toContain("how your body cells process energy from your food");
  });

  it("computes a readability score", () => {
    expect(doc.readability.grade).toBeGreaterThanOrEqual(0);
    expect(doc.readability.targetGradeMin).toBe(6);
    expect(doc.readability.targetGradeMax).toBe(8);
  });

  it("stamps generatedAt from the injected clock", () => {
    expect(doc.generatedAt).toBe("2026-06-13T12:00:00.000Z");
  });
});

describe("buildAvsDocument (Spanish) preserves doses", () => {
  const en = buildAvsDocument({ ...baseInput, language: "en" });
  const es = buildAvsDocument({ ...baseInput, language: "es" });

  it("marks the language and keeps medication doses byte-identical", () => {
    expect(es.language).toBe("es");
    expect(assertDosesUnchanged(en, es)).toBe(true);
    expect(es.nextSteps.join(" ")).toContain("500 mg");
  });

  it("is equivalent to localizing the English document", () => {
    const localized = localizeAvsDocument(en, "es");
    expect(es.decomposed).toEqual(localized.decomposed);
    expect(es.calendars).toEqual(localized.calendars);
  });
});
