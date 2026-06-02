import { describe, expect, it } from "vitest";
import {
  scrubClaimWithReferenceData,
  buildScrubReferenceData,
  mergeScrubReferenceData,
  type ScrubInput,
} from "./scrub";
import type { NcciMueReferenceData } from "./ncci-mue";

const DOS = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);

function baseInput(over: Partial<ScrubInput> = {}): ScrubInput {
  return {
    cptCodes: [{ code: "99213", label: "Office visit", units: 1, chargeAmount: 150, modifiers: [] }],
    icd10Codes: [{ code: "M54.50", label: "Low back pain" }],
    payerName: "Aetna",
    payerId: "60054",
    serviceDate: DOS(7),
    providerId: "1234567893",
    ...over,
  };
}

/** A fake CMS quarterly snapshot — stands in for the DB-backed loader. */
function fakeReference(over: Partial<NcciMueReferenceData> = {}): NcciMueReferenceData {
  return {
    quarter: "2026Q2",
    ncci: [],
    mue: {},
    ...over,
  };
}

describe("EMR-222 — scrubClaimWithReferenceData (full CMS table wiring)", () => {
  it("applies a DB-only NCCI pair the starter set doesn't know about", async () => {
    // 80053 (comprehensive metabolic panel) bundles into 99213 per CMS PTP;
    // this pair is NOT in the in-code starter set.
    const loader = async () =>
      fakeReference({
        ncci: [{ column1Code: "99213", column2Code: "80053", modifierIndicator: 0 }],
      });
    const issues = await scrubClaimWithReferenceData(
      baseInput({
        cptCodes: [
          { code: "99213", label: "Office visit", units: 1, chargeAmount: 150, modifiers: [] },
          { code: "80053", label: "Comprehensive metabolic panel", units: 1, chargeAmount: 30, modifiers: [] },
        ],
      }),
      loader,
    );
    const ncci = issues.find((i) => i.ruleCode === "NCCI_BUNDLED_PAIR");
    expect(ncci).toBeDefined();
    expect(ncci!.severity).toBe("error"); // modifierIndicator 0 = not unbundleable
    expect(ncci!.blocksSubmission).toBe(true);
    expect(ncci!.message).toContain("CMS 2026Q2");
  });

  it("treats modifierIndicator=1 as unbundleable with a distinct-service modifier", async () => {
    const loader = async () =>
      fakeReference({
        ncci: [{ column1Code: "99213", column2Code: "80053", modifierIndicator: 1 }],
      });
    const withModifier = await scrubClaimWithReferenceData(
      baseInput({
        cptCodes: [
          { code: "99213", label: "Office visit", units: 1, chargeAmount: 150, modifiers: ["59"] },
          { code: "80053", label: "CMP", units: 1, chargeAmount: 30, modifiers: ["59"] },
        ],
      }),
      loader,
    );
    expect(withModifier.find((i) => i.ruleCode === "NCCI_BUNDLED_PAIR")).toBeUndefined();

    const withoutModifier = await scrubClaimWithReferenceData(
      baseInput({
        cptCodes: [
          { code: "99213", label: "Office visit", units: 1, chargeAmount: 150, modifiers: [] },
          { code: "80053", label: "CMP", units: 1, chargeAmount: 30, modifiers: [] },
        ],
      }),
      loader,
    );
    const ncci = withoutModifier.find((i) => i.ruleCode === "NCCI_BUNDLED_PAIR");
    expect(ncci).toBeDefined();
    expect(ncci!.severity).toBe("warning");
  });

  it("skips deleted edits (modifierIndicator=9)", async () => {
    const loader = async () =>
      fakeReference({
        ncci: [{ column1Code: "99213", column2Code: "80053", modifierIndicator: 9 }],
      });
    const issues = await scrubClaimWithReferenceData(
      baseInput({
        cptCodes: [
          { code: "99213", label: "Office visit", units: 1, chargeAmount: 150, modifiers: [] },
          { code: "80053", label: "CMP", units: 1, chargeAmount: 30, modifiers: [] },
        ],
      }),
      loader,
    );
    expect(issues.find((i) => i.ruleCode === "NCCI_BUNDLED_PAIR")).toBeUndefined();
  });

  it("enforces a DB-only MUE cap (e.g. 76942 imaging guidance)", async () => {
    const loader = async () => fakeReference({ mue: { "76942": 1 } });
    const issues = await scrubClaimWithReferenceData(
      baseInput({
        cptCodes: [{ code: "76942", label: "US guidance", units: 3, chargeAmount: 120, modifiers: [] }],
      }),
      loader,
    );
    const mue = issues.find((i) => i.ruleCode === "MUE_EXCEEDED");
    expect(mue).toBeDefined();
    expect(mue!.message).toContain("limit is 1");
  });

  it("lets the official CMS MUE value override the in-code starter", () => {
    // Starter caps 36415 at 3/day; CMS quarterly says 1/day — DB wins.
    const merged = mergeScrubReferenceData(fakeReference({ mue: { "36415": 1 } }));
    expect(merged.mueLimits["36415"]).toBe(1);
  });

  it("keeps the starter pair's payer semantics when DB defines the same pair", () => {
    // Starter: 36415+99213 is unbundleable (allowedModifier null). DB lists
    // the same pair as modifierIndicator=1 (unbundleable). Starter must win.
    const merged = mergeScrubReferenceData(
      fakeReference({ ncci: [{ column1Code: "99213", column2Code: "36415", modifierIndicator: 1 }] }),
    );
    const pair = merged.ncciPairs.find(
      (p) => p.componentCode === "36415" && p.comprehensiveCode === "99213",
    );
    expect(pair).toBeDefined();
    expect(pair!.allowedModifier).toBeNull(); // starter semantics preserved
  });

  it("falls back to the starter set when the loader fails", async () => {
    const loader = async () => {
      throw new Error("DB unavailable");
    };
    // Starter still caps 99213 at 1/day.
    const issues = await scrubClaimWithReferenceData(
      baseInput({ cptCodes: [{ code: "99213", label: "Office visit", units: 5, chargeAmount: 150, modifiers: [] }] }),
      loader,
    );
    expect(issues.find((i) => i.ruleCode === "MUE_EXCEEDED")).toBeDefined();

    const ref = await buildScrubReferenceData(loader);
    expect(ref.quarter).toBeNull();
  });
});
