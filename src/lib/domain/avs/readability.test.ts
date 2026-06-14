import { describe, expect, it } from "vitest";
import {
  computeReadability,
  countSyllables,
  fleschKincaidGrade,
  medicalDensity,
  simplifyForReadability,
} from "./readability";
import {
  assertDosesUnchanged,
  assertNumericTokensPreserved,
  localizeAvsDocument,
  localizeText,
  numericTokens,
} from "./localization";
import type { AvsDocument } from "./types";

describe("readability scoring", () => {
  it("counts syllables sensibly", () => {
    expect(countSyllables("cat")).toBe(1);
    expect(countSyllables("medicine")).toBeGreaterThanOrEqual(2);
    expect(countSyllables("")).toBe(0);
  });

  it("scores simple copy below complex copy", () => {
    const simple = "Take your pill each day. Drink water. Rest well.";
    const complex =
      "Subsequently, the patient should administer the pharmacological intervention approximately twice daily notwithstanding gastrointestinal contraindications.";
    expect(fleschKincaidGrade(simple)).toBeLessThan(fleschKincaidGrade(complex));
  });

  it("produces a full readability profile with the 6-8 grade band", () => {
    const score = computeReadability("Take your pill each day. Drink water.");
    expect(score.targetGradeMin).toBe(6);
    expect(score.targetGradeMax).toBe(8);
    expect(score.meetsTarget).toBe(true);
    expect(score.index).toBeGreaterThan(0);
  });

  it("flags above-band clinical prose as not meeting target", () => {
    const score = computeReadability(
      "Subsequently the patient must administer pharmacological agents notwithstanding gastrointestinal contraindications associated with hepatic dysfunction.",
    );
    expect(score.meetsTarget).toBe(false);
    expect(score.medicalDensity).toBeGreaterThan(0);
  });

  it("medicalDensity ignores common long words", () => {
    expect(medicalDensity("medicine appointment tomorrow")).toBe(0);
  });

  it("simplifyForReadability swaps complex words and keeps numbers", () => {
    const out = simplifyForReadability("Administer 500 mg and discontinue prior to your appointment.");
    expect(out.toLowerCase()).toContain("take");
    expect(out.toLowerCase()).toContain("stop");
    expect(out).toContain("500 mg");
  });
});

describe("localization — dose safety", () => {
  it("extracts numeric/dose tokens", () => {
    expect(numericTokens("metformin 500 mg twice daily, 14:10 window")).toEqual(["500 mg", "14:10"]);
  });

  it("Spanish translation preserves doses and translates frequency", () => {
    const before = "Take metformin 500 mg twice daily with meals.";
    const { text } = localizeText(before, "es");
    expect(text).toContain("500 mg");
    expect(text.toLowerCase()).toContain("dos veces al día");
    expect(text.toLowerCase()).toContain("con las comidas");
    expect(assertNumericTokensPreserved(before, text)).toBe(true);
  });

  it("Vietnamese translation preserves doses and translates frequency", () => {
    const before = "Take metformin 500 mg twice daily.";
    const { text } = localizeText(before, "vi");
    expect(text).toContain("500 mg");
    expect(text.toLowerCase()).toContain("hai lần mỗi ngày");
    expect(assertNumericTokensPreserved(before, text)).toBe(true);
  });

  it("applies culturally sensitive plain-language substitution", () => {
    const { text } = localizeText("You have insulin resistance.", "en");
    expect(text).toContain("how your body cells process energy from your food");
  });

  it("preserves a clock-window dose like 14:10 across translation", () => {
    const before = "Begin a 14:10 fasting window today.";
    expect(assertNumericTokensPreserved(before, localizeText(before, "es").text)).toBe(true);
    expect(assertNumericTokensPreserved(before, localizeText(before, "vi").text)).toBe(true);
  });
});

describe("localization — AVS document structured-field safety", () => {
  const doc: AvsDocument = {
    version: 1,
    language: "en",
    patientFirstName: "Maria",
    visitDate: "June 13, 2026",
    provider: "Dr. Patel",
    narrative: "Today we talked about your high blood pressure. Continue your care plan.",
    decomposed: {
      medications: [
        { action: "INITIATE", molecule: "Metformin", dose: "500 mg", route: "by mouth", timing: "twice daily", raw: "Start metformin 500 mg twice daily" },
      ],
      dietary: [],
      behavioral: [],
      unclassified: [],
    },
    calendars: [
      {
        molecule: "Metformin",
        steps: [
          { startDay: 1, endDay: 14, dayRange: "Days 1–14", timeOfDay: "With meals", instruction: "Take 500 mg twice daily", goal: null },
        ],
      },
    ],
    roadmap: { nutrition: [], behavior: [] },
    nextSteps: ["Take your 500 mg dose twice daily."],
    followUp: "Follow-up in 4 weeks.",
    readability: {
      grade: 5, avgWordLength: 4, avgSentenceLength: 8, medicalDensity: 0,
      index: 10, targetGradeMin: 6, targetGradeMax: 8, meetsTarget: true,
    },
    sourceNote: "Plan: start metformin 500 mg BID.",
    generatedAt: "2026-06-13T00:00:00.000Z",
  };

  it("es localization leaves medication dose/timing byte-identical", () => {
    const localized = localizeAvsDocument(doc, "es");
    expect(localized.language).toBe("es");
    expect(localized.decomposed.medications[0].dose).toBe("500 mg");
    expect(localized.decomposed.medications[0].timing).toBe("twice daily");
    expect(assertDosesUnchanged(doc, localized)).toBe(true);
  });

  it("vi localization preserves doses in translated nextSteps", () => {
    const localized = localizeAvsDocument(doc, "vi");
    expect(localized.nextSteps[0]).toContain("500 mg");
    expect(assertDosesUnchanged(doc, localized)).toBe(true);
  });
});
