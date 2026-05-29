import { describe, expect, it } from "vitest";
import {
  CONSTITUTION,
  HEART_CENTRIC,
  HEART_CENTRIC_CREED,
  formatConstitutionForPrompt,
} from "./constitution";

describe("constitution", () => {
  it("leads with Article IV — heart-centric", () => {
    expect(HEART_CENTRIC.id).toBe("IV");
    expect(CONSTITUTION[0]).toBe(HEART_CENTRIC);
  });

  it("the creed names the non-negotiable stance", () => {
    expect(HEART_CENTRIC_CREED.toLowerCase()).toContain("heart-centric");
    expect(HEART_CENTRIC_CREED.toLowerCase()).toContain("not money");
    expect(HEART_CENTRIC_CREED).toContain("MyStory");
  });

  it("renders just Article IV by default and the full doc on request", () => {
    const compact = formatConstitutionForPrompt();
    expect(compact).toContain("Art. IV");
    expect(compact).not.toContain("Art. V");

    const full = formatConstitutionForPrompt({ full: true });
    expect(full).toContain("Art. IV");
    expect(full).toContain("Art. VII");
  });
});
