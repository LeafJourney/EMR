// EMR-752 — seat-limit decision tests (pure, no Prisma).

import { describe, it, expect } from "vitest";
import {
  decideSeatLimit,
  nextTierUp,
  TIER_SEAT_LIMITS,
} from "./seat-enforcement";

describe("decideSeatLimit", () => {
  it("allows when under the tier seat limit", () => {
    const d = decideSeatLimit({ currentSeats: 2, tier: "team" });
    expect(d.allow).toBe(true);
  });

  it("blocks when at the tier seat limit", () => {
    const d = decideSeatLimit({ currentSeats: 5, tier: "team" });
    expect(d).toEqual({
      allow: false,
      code: "seat_limit_exceeded",
      currentSeats: 5,
      seatLimit: 5,
      tier: "team",
      suggestedTier: "practice",
    });
  });

  it("blocks when over the tier seat limit", () => {
    const d = decideSeatLimit({ currentSeats: 30, tier: "practice" });
    expect(d.allow).toBe(false);
  });

  it("always allows on enterprise (unlimited seats)", () => {
    expect(decideSeatLimit({ currentSeats: 9999, tier: "enterprise" })).toEqual({
      allow: true,
    });
  });

  it("solo tier blocks the second seat", () => {
    expect(decideSeatLimit({ currentSeats: 0, tier: "solo" }).allow).toBe(true);
    expect(decideSeatLimit({ currentSeats: 1, tier: "solo" }).allow).toBe(false);
  });
});

describe("nextTierUp", () => {
  it("walks the ladder", () => {
    expect(nextTierUp("solo")).toBe("team");
    expect(nextTierUp("team")).toBe("practice");
    expect(nextTierUp("practice")).toBe("enterprise");
    expect(nextTierUp("enterprise")).toBe(null);
  });
});

describe("TIER_SEAT_LIMITS", () => {
  it("uses null for unlimited and integers for capped tiers", () => {
    expect(TIER_SEAT_LIMITS.solo).toBe(1);
    expect(TIER_SEAT_LIMITS.team).toBe(5);
    expect(TIER_SEAT_LIMITS.practice).toBe(25);
    expect(TIER_SEAT_LIMITS.enterprise).toBe(null);
  });
});
