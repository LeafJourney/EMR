import { describe, expect, it } from "vitest";
import { getLocalDayBounds, sameLocalDay } from "./timezone";

describe("Timezone bounds utility", () => {
  it("computes bounds for America/New_York", () => {
    // May 21, 2026, 12:00:00 UTC (8:00 AM EDT)
    const testDate = new Date("2026-05-21T12:00:00Z");
    const { startOfDay, endOfDay } = getLocalDayBounds("America/New_York", testDate);

    // New York is EDT (UTC-4) in May
    // startOfDay should be May 21, 2026, 04:00:00 UTC
    expect(startOfDay.toISOString()).toBe("2026-05-21T04:00:00.000Z");
    // endOfDay should be May 22, 2026, 04:00:00 UTC
    expect(endOfDay.toISOString()).toBe("2026-05-22T04:00:00.000Z");
  });

  it("computes bounds for America/Los_Angeles", () => {
    // May 21, 2026, 12:00:00 UTC (5:00 AM PDT)
    const testDate = new Date("2026-05-21T12:00:00Z");
    const { startOfDay, endOfDay } = getLocalDayBounds("America/Los_Angeles", testDate);

    // LA is PDT (UTC-7) in May
    // startOfDay should be May 21, 2026, 07:00:00 UTC
    expect(startOfDay.toISOString()).toBe("2026-05-21T07:00:00.000Z");
    // endOfDay should be May 22, 2026, 07:00:00 UTC
    expect(endOfDay.toISOString()).toBe("2026-05-22T07:00:00.000Z");
  });

  it("checks sameLocalDay correctness", () => {
    const tz = "America/New_York";
    // 2026-05-21 23:59:00 EDT (03:59:00 UTC on May 22)
    const dateA = new Date("2026-05-22T03:59:00Z");
    // 2026-05-21 00:01:00 EDT (04:01:00 UTC on May 21)
    const dateB = new Date("2026-05-21T04:01:00Z");
    // 2026-05-22 00:01:00 EDT (04:01:00 UTC on May 22)
    const dateC = new Date("2026-05-22T04:01:00Z");

    expect(sameLocalDay(dateA, dateB, tz)).toBe(true);
    expect(sameLocalDay(dateA, dateC, tz)).toBe(false);
  });
});
