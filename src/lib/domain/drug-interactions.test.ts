import { describe, expect, it } from "vitest";
import { checkInteractions, inferCannabinoidsFromName } from "./drug-interactions";

/**
 * WS-C task 2 — custom/free-text products have no structured cannabinoid
 * profile, so the prescribe flow infers a best-effort one from the name (and
 * "open to" hints) before running the interaction screen. This must never
 * silently produce an empty profile.
 */
describe("inferCannabinoidsFromName", () => {
  it("extracts cannabinoid tokens present in the name", () => {
    expect(inferCannabinoidsFromName("High-CBD CBN sleep oil").sort()).toEqual(
      ["CBD", "CBN"].sort(),
    );
  });

  it("treats a ratio as implying THC + CBD", () => {
    expect(inferCannabinoidsFromName("1:1 balanced tincture").sort()).toEqual(
      ["CBD", "THC"].sort(),
    );
  });

  it("merges explicit 'open to' hints", () => {
    expect(
      inferCannabinoidsFromName("House blend", ["THC", "cbg"]).sort(),
    ).toEqual(["CBG", "THC"].sort());
  });

  it("falls back to THC + CBD when nothing is recognizable", () => {
    expect(inferCannabinoidsFromName("Mystery tincture").sort()).toEqual(
      ["CBD", "THC"].sort(),
    );
  });

  it("never returns an empty profile (so screening always runs)", () => {
    expect(inferCannabinoidsFromName("").length).toBeGreaterThan(0);
  });

  it("produces a profile that surfaces a known red interaction (warfarin)", () => {
    const cannabinoids = inferCannabinoidsFromName("Custom blend tincture");
    const interactions = checkInteractions(["Warfarin 5mg"], cannabinoids);
    expect(interactions.some((i) => i.severity === "red")).toBe(true);
  });
});
