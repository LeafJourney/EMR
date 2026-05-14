import { describe, it, expect } from "vitest";
import {
  computeLifestyleGrowth,
  dayKey,
  FLOWER_STREAK_DAYS,
  LEAF_CAP,
  STEM_CAP,
  type LifestyleCheckEvent,
} from "./lifestyle-growth";

const CATEGORIES = ["sleep", "nutrition", "movement", "stress"];

function isoAt(daysAgo: number, hour = 10, base = new Date("2026-05-12T12:00:00")): string {
  const d = new Date(base);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe("computeLifestyleGrowth", () => {
  const NOW = new Date("2026-05-12T12:00:00");

  it("starts at zero with no events", () => {
    const g = computeLifestyleGrowth({ events: [], categories: CATEGORIES, now: NOW });
    expect(g.leafCount).toBe(0);
    expect(g.stemCount).toBe(0);
    expect(g.streakDays).toBe(0);
    expect(g.hasFlowers).toBe(false);
    expect(g.missingToday).toEqual(CATEGORIES);
    expect(g.nextNudge).toMatch(/first leaf/i);
  });

  it("counts each check as one leaf, capped", () => {
    const events: LifestyleCheckEvent[] = Array.from({ length: LEAF_CAP + 4 }, (_, i) => ({
      tipKey: `t${i}`,
      domainId: "sleep",
      checkedAt: isoAt(0, 10 + i),
    }));
    const g = computeLifestyleGrowth({ events, categories: CATEGORIES, now: NOW });
    expect(g.leafCount).toBe(LEAF_CAP);
  });

  it("awards a stem only on days with every category checked", () => {
    const events: LifestyleCheckEvent[] = [
      // Today covers 3 of 4 categories — no stem.
      { tipKey: "1", domainId: "sleep", checkedAt: isoAt(0) },
      { tipKey: "2", domainId: "nutrition", checkedAt: isoAt(0) },
      { tipKey: "3", domainId: "movement", checkedAt: isoAt(0) },
      // Yesterday covers all four — one stem.
      { tipKey: "4", domainId: "sleep", checkedAt: isoAt(1) },
      { tipKey: "5", domainId: "nutrition", checkedAt: isoAt(1) },
      { tipKey: "6", domainId: "movement", checkedAt: isoAt(1) },
      { tipKey: "7", domainId: "stress", checkedAt: isoAt(1) },
    ];
    const g = computeLifestyleGrowth({ events, categories: CATEGORIES, now: NOW });
    expect(g.stemCount).toBe(1);
    expect(g.missingToday).toEqual(["stress"]);
    expect(g.nextNudge).toMatch(/stress/);
  });

  it("counts streak only when ending today/now", () => {
    // 3 consecutive days ending yesterday, plus a gap — streak is 0.
    const events: LifestyleCheckEvent[] = [];
    for (const d of [1, 2, 3]) {
      for (const cat of CATEGORIES) {
        events.push({ tipKey: `${d}-${cat}`, domainId: cat, checkedAt: isoAt(d) });
      }
    }
    const g = computeLifestyleGrowth({ events, categories: CATEGORIES, now: NOW });
    expect(g.streakDays).toBe(0);
  });

  it("tracks a continuous streak ending today", () => {
    const events: LifestyleCheckEvent[] = [];
    for (const d of [0, 1, 2, 3, 4]) {
      for (const cat of CATEGORIES) {
        events.push({ tipKey: `${d}-${cat}`, domainId: cat, checkedAt: isoAt(d) });
      }
    }
    const g = computeLifestyleGrowth({ events, categories: CATEGORIES, now: NOW });
    expect(g.streakDays).toBe(5);
    expect(g.hasFlowers).toBe(false);
    expect(g.nextNudge).toMatch(/Stem earned today/);
  });

  it("unlocks flowers at the full-coverage streak threshold", () => {
    const events: LifestyleCheckEvent[] = [];
    for (let d = 0; d < FLOWER_STREAK_DAYS; d++) {
      for (const cat of CATEGORIES) {
        events.push({ tipKey: `${d}-${cat}`, domainId: cat, checkedAt: isoAt(d) });
      }
    }
    const g = computeLifestyleGrowth({ events, categories: CATEGORIES, now: NOW });
    expect(g.streakDays).toBeGreaterThanOrEqual(FLOWER_STREAK_DAYS);
    expect(g.hasFlowers).toBe(true);
    expect(g.nextNudge).toMatch(/bloom/i);
  });

  it("caps stems at STEM_CAP", () => {
    const events: LifestyleCheckEvent[] = [];
    for (let d = 0; d < STEM_CAP + 3; d++) {
      for (const cat of CATEGORIES) {
        events.push({ tipKey: `${d}-${cat}`, domainId: cat, checkedAt: isoAt(d) });
      }
    }
    const g = computeLifestyleGrowth({ events, categories: CATEGORIES, now: NOW });
    expect(g.stemCount).toBe(STEM_CAP);
  });

  it("ignores malformed checkedAt values", () => {
    const events: LifestyleCheckEvent[] = [
      { tipKey: "1", domainId: "sleep", checkedAt: "not-a-date" },
      { tipKey: "2", domainId: "sleep", checkedAt: isoAt(0) },
    ];
    const g = computeLifestyleGrowth({ events, categories: CATEGORIES, now: NOW });
    expect(g.leafCount).toBe(2); // both events count as leaves
    expect(g.stemCount).toBe(0); // malformed cannot contribute to any day's coverage
  });
});

describe("dayKey", () => {
  it("formats a local-day key as YYYY-MM-DD", () => {
    const d = new Date(2026, 4, 12, 10);
    expect(dayKey(d)).toBe("2026-05-12");
  });

  it("zero-pads month and day", () => {
    const d = new Date(2026, 0, 4, 10);
    expect(dayKey(d)).toBe("2026-01-04");
  });
});
