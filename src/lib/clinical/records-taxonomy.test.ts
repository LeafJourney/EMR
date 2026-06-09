import { describe, expect, it } from "vitest";
import {
  RECORD_SUBTABS,
  IMAGING_MODALITIES,
  CARDIOLOGY_STUDIES,
} from "./records-taxonomy";

// EMR-862 / EMR-864 / EMR-865 — records section taxonomy

describe("RECORD_SUBTABS", () => {
  it("includes every subtab Dr. Patel named", () => {
    const keys = RECORD_SUBTABS.map((s) => s.key);
    for (const k of [
      "calculator",
      "consults",
      "images",
      "cardiology",
      "legal",
      "ancillary",
      "disability",
      "procedures",
      "my-notes",
      "insurance",
      "e-signed",
    ]) {
      expect(keys).toContain(k);
    }
  });

  it("gives every subtab an emoji and at least one tertiary label", () => {
    for (const s of RECORD_SUBTABS) {
      expect(s.emoji.length).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.tertiaryLabels.length).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (const lbl of s.tertiaryLabels) {
        expect(seen.has(lbl.key)).toBe(false);
        seen.add(lbl.key);
        // colorClass should look like tailwind bubble classes
        expect(lbl.colorClass).toMatch(/^bg-\S+ text-\S+ border-\S+$/);
      }
    }
  });

  it("honors Dr. Patel's fixed specialty colors", () => {
    const consults = RECORD_SUBTABS.find((s) => s.key === "consults")!;
    const byKey = (k: string) =>
      consults.tertiaryLabels.find((l) => l.key === k)!;
    expect(byKey("oncology").colorClass).toContain("green");
    expect(byKey("neurology").colorClass).toContain("blue");
    expect(byKey("dermatology").colorClass).toContain("purple");

    const procedures = RECORD_SUBTABS.find((s) => s.key === "procedures")!;
    expect(procedures.tertiaryLabels.find((l) => l.key === "egd")!.colorClass).toContain("green");
    expect(procedures.tertiaryLabels.find((l) => l.key === "colonoscopy")!.colorClass).toContain("amber");
  });
});

describe("IMAGING_MODALITIES", () => {
  it("maps modalities to body parts with Dr. Patel's colors", () => {
    const byKey = (k: string) => IMAGING_MODALITIES.find((m) => m.key === k)!;
    expect(byKey("ct").bodyParts).toEqual(["chest", "abdomen/pelvis", "head"]);
    expect(byKey("ct").colorClass).toContain("green");
    expect(byKey("mri").colorClass).toContain("blue");
    expect(byKey("pet").bodyParts).toEqual([]);
    expect(byKey("mra").bodyParts).toContain("carotid");
  });
});

describe("CARDIOLOGY_STUDIES", () => {
  it("lists the six cardiology studies", () => {
    expect(CARDIOLOGY_STUDIES.length).toBe(6);
    const keys = CARDIOLOGY_STUDIES.map((s) => s.key);
    expect(keys).toContain("echocardiogram");
    expect(keys).toContain("holter-monitor");
  });
});
