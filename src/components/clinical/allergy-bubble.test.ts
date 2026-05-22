import { describe, it, expect } from "vitest";
import { classifyAllergyKind } from "./allergy-bubble";

describe("allergy classifier (EMR-696)", () => {
  it("classifies immune-mediated reactions as true allergies (red bubble)", () => {
    expect(classifyAllergyKind("hives")).toBe("true-allergy");
    expect(classifyAllergyKind("angioedema")).toBe("true-allergy");
    expect(classifyAllergyKind("anaphylaxis")).toBe("true-allergy");
  });

  it("classifies adverse reactions as adverse (yellow bubble)", () => {
    expect(classifyAllergyKind("nausea")).toBe("adverse-reaction");
    expect(classifyAllergyKind("vomiting")).toBe("adverse-reaction");
    expect(classifyAllergyKind("body aches")).toBe("adverse-reaction");
    expect(classifyAllergyKind("weakness")).toBe("adverse-reaction");
  });

  it("ibuprofen GI upset is a reaction, not a true allergy", () => {
    expect(classifyAllergyKind("stomach upset")).toBe("adverse-reaction");
  });
});
