import { describe, expect, it } from "vitest";
import { splitIntoApsoSections } from "../voice-dictation";
import {
  ensureSoapBlocks,
  mergeDictatedBody,
  routeDictationToBlocks,
  soapTargetTypes,
} from "../dictation-routing";

const empty = {
  assessment: "",
  plan: "",
  subjective: "",
  objective: "",
  unfiled: "",
};

describe("routeDictationToBlocks", () => {
  it("folds pre-cue (unfiled) and subjective speech into the summary block", () => {
    const { byType } = routeDictationToBlocks(
      { ...empty, unfiled: "Patient reports better sleep.", subjective: "Mood improved." },
      { includeObjective: false },
    );
    expect(byType.summary).toBe("Patient reports better sleep. Mood improved.");
  });

  it("maps assessment and plan onto their blocks", () => {
    const { byType } = routeDictationToBlocks(
      { ...empty, assessment: "Chronic insomnia, improving.", plan: "Continue evening CBD." },
      { includeObjective: false },
    );
    expect(byType.assessment).toBe("Chronic insomnia, improving.");
    expect(byType.plan).toBe("Continue evening CBD.");
  });

  it("withholds Objective by default (staff documents vitals)", () => {
    const result = routeDictationToBlocks(
      { ...empty, objective: "BP 120/80, HR 72." },
      { includeObjective: false },
    );
    expect(result.byType.findings).toBeUndefined();
    expect(result.skippedObjective).toBe("BP 120/80, HR 72.");
  });

  it("routes Objective into findings when the physician opts in", () => {
    const result = routeDictationToBlocks(
      { ...empty, objective: "BP 120/80, HR 72." },
      { includeObjective: true },
    );
    expect(result.byType.findings).toBe("BP 120/80, HR 72.");
    expect(result.skippedObjective).toBe("");
  });

  it("end-to-end: parses a dictated stream and routes it by SOAP cue", () => {
    const transcript =
      "Subjective: patient reports improved sleep. " +
      "Assessment: chronic insomnia improving. " +
      "Plan: continue current regimen.";
    const { byType } = routeDictationToBlocks(
      splitIntoApsoSections(transcript),
      { includeObjective: false },
    );
    expect(byType.summary).toContain("improved sleep");
    expect(byType.assessment).toContain("chronic insomnia improving");
    expect(byType.plan).toContain("continue current regimen");
  });
});

describe("mergeDictatedBody", () => {
  it("appends dictated text below existing content with a blank line", () => {
    expect(mergeDictatedBody("Seeded by AI.", "Dictated addition.")).toBe(
      "Seeded by AI.\n\nDictated addition.",
    );
  });

  it("returns just the dictated text when the base is empty", () => {
    expect(mergeDictatedBody("", "Dictated only.")).toBe("Dictated only.");
  });

  it("leaves the base untouched when there is no dictated text", () => {
    expect(mergeDictatedBody("Existing.", "")).toBe("Existing.");
  });

  it("is idempotent across streaming updates against the same base", () => {
    const base = "AI seed.";
    const once = mergeDictatedBody(base, "BP rising");
    const twice = mergeDictatedBody(base, "BP rising and HR up");
    expect(once).toBe("AI seed.\n\nBP rising");
    expect(twice).toBe("AI seed.\n\nBP rising and HR up");
  });
});

describe("soapTargetTypes", () => {
  it("excludes Objective by default and includes it on opt-in", () => {
    expect(soapTargetTypes(false)).toEqual(["summary", "assessment", "plan"]);
    expect(soapTargetTypes(true)).toEqual(["summary", "findings", "assessment", "plan"]);
  });
});

describe("ensureSoapBlocks", () => {
  it("creates empty APSO-labelled blocks for missing SOAP sections", () => {
    const result = ensureSoapBlocks([], false);
    const types = result.map((b) => b.type);
    // APSO order: assessment, plan, summary, (findings), followUp
    expect(types).toEqual(["assessment", "plan", "summary"]);
    expect(result.every((b) => b.body === "")).toBe(true);
    expect(result.find((b) => b.type === "summary")?.heading).toBe("Subjective");
  });

  it("adds the Objective block only when opted in, in APSO position", () => {
    const result = ensureSoapBlocks([], true);
    expect(result.map((b) => b.type)).toEqual([
      "assessment",
      "plan",
      "summary",
      "findings",
    ]);
  });

  it("preserves existing blocks and their content, APSO-sorted", () => {
    const existing = [
      { type: "plan" as const, heading: "Plan", body: "Existing plan." },
      { type: "assessment" as const, heading: "Assessment", body: "Existing assessment." },
    ];
    const result = ensureSoapBlocks(existing, false);
    expect(result.map((b) => b.type)).toEqual(["assessment", "plan", "summary"]);
    expect(result.find((b) => b.type === "assessment")?.body).toBe("Existing assessment.");
    expect(result.find((b) => b.type === "plan")?.body).toBe("Existing plan.");
    // Only the missing Subjective is added empty.
    expect(result.find((b) => b.type === "summary")?.body).toBe("");
  });
});
