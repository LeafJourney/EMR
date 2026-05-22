import { describe, expect, it } from "vitest";
import {
  isStuckConfig,
  medianMs,
  momDelta,
  zeroFillDailySeries,
} from "./types";

describe("momDelta", () => {
  it("returns 0 when both values are 0", () => {
    expect(momDelta(0, 0)).toBe(0);
  });

  it("returns Infinity when prev is 0 and current is positive", () => {
    expect(momDelta(10, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns -Infinity when prev is 0 and current is negative", () => {
    expect(momDelta(-10, 0)).toBe(Number.NEGATIVE_INFINITY);
  });

  it("computes percent change from prev to current", () => {
    expect(momDelta(150, 100)).toBe(50);
    expect(momDelta(75, 100)).toBe(-25);
    expect(momDelta(100, 100)).toBe(0);
  });

  it("handles decreases from non-zero prev", () => {
    expect(momDelta(0, 100)).toBe(-100);
  });
});

describe("zeroFillDailySeries", () => {
  const fixedNow = new Date("2026-05-17T12:00:00.000Z");

  it("returns exactly `days` entries", () => {
    const out = zeroFillDailySeries(new Map(), 30, fixedNow);
    expect(out).toHaveLength(30);
  });

  it("ends on the supplied date (UTC) and starts days-1 earlier", () => {
    const out = zeroFillDailySeries(new Map(), 5, fixedNow);
    expect(out[out.length - 1].date).toBe("2026-05-17");
    expect(out[0].date).toBe("2026-05-13");
  });

  it("zero-fills missing days but preserves bucketed values", () => {
    const buckets = new Map([
      [
        "2026-05-15",
        { claims: 3, charges: 7, encounters: 2, billedCents: 50000, newPatients: 1 },
      ],
    ]);
    const out = zeroFillDailySeries(buckets, 5, fixedNow);
    const may15 = out.find((p) => p.date === "2026-05-15");
    expect(may15).toEqual({
      date: "2026-05-15",
      claims: 3,
      charges: 7,
      encounters: 2,
      billedCents: 50000,
      newPatients: 1,
    });
    const may14 = out.find((p) => p.date === "2026-05-14");
    expect(may14).toEqual({
      date: "2026-05-14",
      claims: 0,
      charges: 0,
      encounters: 0,
      billedCents: 0,
      newPatients: 0,
    });
  });

  it("emits dates in chronological order", () => {
    const out = zeroFillDailySeries(new Map(), 7, fixedNow);
    const dates = out.map((p) => p.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});

describe("isStuckConfig", () => {
  const now = new Date("2026-05-17T12:00:00.000Z");

  it("returns false for published configs even when old", () => {
    const old = new Date(now.getTime() - 30 * 86_400_000);
    expect(isStuckConfig("published", old, now)).toBe(false);
  });

  it("returns false for archived configs", () => {
    const old = new Date(now.getTime() - 30 * 86_400_000);
    expect(isStuckConfig("archived", old, now)).toBe(false);
  });

  it("returns false for fresh draft configs (< 24h)", () => {
    const fresh = new Date(now.getTime() - 60 * 60 * 1000);
    expect(isStuckConfig("draft", fresh, now)).toBe(false);
  });

  it("returns true for draft configs older than 24h", () => {
    const stale = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    expect(isStuckConfig("draft", stale, now)).toBe(true);
  });

  it("honors a custom staleHours threshold", () => {
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    expect(isStuckConfig("draft", fourHoursAgo, now, 2)).toBe(true);
    expect(isStuckConfig("draft", fourHoursAgo, now, 6)).toBe(false);
  });
});

describe("medianMs", () => {
  it("returns 0 for an empty list", () => {
    expect(medianMs([])).toBe(0);
  });

  it("returns the middle value for odd-length lists", () => {
    expect(medianMs([1000, 5000, 3000])).toBe(3000);
  });

  it("averages the two middle values for even-length lists", () => {
    expect(medianMs([1000, 2000, 3000, 4000])).toBe(2500);
  });
});
