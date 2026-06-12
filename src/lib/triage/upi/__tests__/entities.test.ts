// UPI entity extraction — negation, subject attribution, abbreviation
// expansion, lexicon acuity (EMR-1146).

import { describe, expect, it } from "vitest";
import {
  ADMIN_BASELINE_ACUITY,
  extractEntities,
  normalizeMessageText,
} from "../entities";

describe("normalizeMessageText", () => {
  it("expands clinical shorthand on word boundaries", () => {
    expect(normalizeMessageText("having SOB since last night")).toContain(
      "shortness of breath",
    );
    expect(normalizeMessageText("bad n/v all day")).toContain("nausea and vomiting");
  });

  it("does not expand shorthand inside other words", () => {
    // "sobbing" must not become "shortness of breathbing"
    expect(normalizeMessageText("I was sobbing")).toBe("i was sobbing");
  });

  it("normalizes apostrophe-less contractions", () => {
    expect(normalizeMessageText("I cant breathe")).toContain("can't breathe");
  });

  it("strips emoji but keeps clause punctuation", () => {
    expect(normalizeMessageText("no chest pain 😊, just checking in!")).toBe(
      "no chest pain , just checking in!",
    );
  });
});

describe("extractEntities — lexicon & acuity", () => {
  it("maps red-flag symptoms to acuity 1.0", () => {
    const r = extractEntities("I have crushing chest pain radiating to my arm");
    const redFlag = r.activeEntities.find((e) => e.id === "crushing_chest_pain");
    expect(redFlag).toBeDefined();
    expect(redFlag!.acuity).toBe(1.0);
    expect(r.baseAcuity).toBe(1.0);
  });

  it("recognizes expanded abbreviations as red flags", () => {
    const r = extractEntities("having sob and chest tightness");
    expect(r.activeEntities.map((e) => e.id)).toContain("shortness_of_breath");
    expect(r.activeEntities.map((e) => e.id)).toContain("chest_pain");
  });

  it("classifies admin/scheduling messages at the 0.1 baseline", () => {
    const r = extractEntities("Could I reschedule my appointment and get a refill?");
    expect(r.activeEntities).toHaveLength(0);
    expect(r.baseAcuity).toBe(ADMIN_BASELINE_ACUITY);
  });

  it("returns the admin baseline for empty / non-clinical text", () => {
    expect(extractEntities("").baseAcuity).toBe(ADMIN_BASELINE_ACUITY);
    expect(extractEntities("thanks so much, see you soon!").baseAcuity).toBe(
      ADMIN_BASELINE_ACUITY,
    );
  });

  it("applies the fever+rash combo bump to mid-tier acuity", () => {
    const r = extractEntities("I have a fever and a rash on my arms");
    expect(r.baseAcuity).toBeCloseTo(0.6, 5);
  });

  it("prefers the most specific lexicon entry on overlapping spans", () => {
    const r = extractEntities("crushing chest pain tonight");
    const ids = r.entities.map((e) => e.id);
    expect(ids).toContain("crushing_chest_pain");
    expect(ids).not.toContain("chest_pain");
  });
});

describe("extractEntities — negation filtering", () => {
  it("marks 'no chest pain' as negated and keeps acuity at baseline", () => {
    const r = extractEntities("No chest pain, just a refill question");
    const cp = r.entities.find((e) => e.id === "chest_pain");
    expect(cp).toBeDefined();
    expect(cp!.negated).toBe(true);
    expect(r.activeEntities).toHaveLength(0);
    expect(r.baseAcuity).toBe(ADMIN_BASELINE_ACUITY);
  });

  it("handles 'denies' and 'without'", () => {
    expect(
      extractEntities("denies fever or vomiting").activeEntities,
    ).toHaveLength(0);
    expect(
      extractEntities("feeling fine without any dizziness").activeEntities,
    ).toHaveLength(0);
  });

  it("treats post-hoc resolution as negation ('but it's gone')", () => {
    const r = extractEntities("I had a rash last week but it's gone");
    const rash = r.entities.find((e) => e.id === "rash");
    expect(rash?.negated).toBe(true);
  });

  it("does NOT negate 'never had chest pain like this' (re-assertion)", () => {
    const r = extractEntities("I've never had chest pain like this before");
    const cp = r.entities.find((e) => e.id === "chest_pain");
    expect(cp).toBeDefined();
    expect(cp!.negated).toBe(false);
    expect(r.baseAcuity).toBeGreaterThanOrEqual(0.9);
  });

  it("negation in one sentence does not leak into the next", () => {
    const r = extractEntities("No fever today. The chest pain is back though.");
    const cp = r.entities.find((e) => e.id === "chest_pain");
    expect(cp?.negated).toBe(false);
  });
});

describe("extractEntities — subject attribution", () => {
  it("marks 'my daughter has a rash' as third-party", () => {
    const r = extractEntities("My daughter has a rash on her leg");
    const rash = r.entities.find((e) => e.id === "rash");
    expect(rash?.thirdParty).toBe(true);
    expect(r.activeEntities).toHaveLength(0);
  });

  it("marks 'my husband ... seizures' as third-party", () => {
    const r = extractEntities(
      "My husband has been having seizures, can you recommend a neurologist for him?",
    );
    const sz = r.entities.find((e) => e.id === "seizure");
    expect(sz?.thirdParty).toBe(true);
    expect(r.baseAcuity).toBe(ADMIN_BASELINE_ACUITY);
  });

  it("re-anchors to the patient after a first-person pronoun", () => {
    const r = extractEntities(
      "My husband said I should message you, I have chest pain",
    );
    const cp = r.entities.find((e) => e.id === "chest_pain");
    expect(cp?.thirdParty).toBe(false);
    expect(r.baseAcuity).toBeGreaterThanOrEqual(0.9);
  });

  it("third-party attribution in one sentence does not leak into the next", () => {
    const r = extractEntities("My son had a cold. Anyway, I have chest pain now.");
    const cp = r.entities.find((e) => e.id === "chest_pain");
    expect(cp?.thirdParty).toBe(false);
  });
});
