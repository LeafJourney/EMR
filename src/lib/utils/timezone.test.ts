import { describe, expect, it } from "vitest";
import {
  getLocalDayBounds,
  sameLocalDay,
  greetingForTimeZone,
  zonedTimeToUtc,
  getZonedParts,
} from "./timezone";

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

describe("greetingForTimeZone", () => {
  it("uses the clinic's local hour, not the server's UTC clock", () => {
    // 2026-06-08T04:30:00Z is the bug scenario: server UTC reads hour 4
    // ("Still up") and date Jun 8, while in LA it is still Jun 7, 9:30 PM.
    const instant = new Date("2026-06-08T04:30:00Z");
    const la = greetingForTimeZone("America/Los_Angeles", instant);
    expect(la).not.toBe("Still up"); // the bug: this used to fire mid-evening
    expect(la).toBe("Hello"); // 9:30 PM bucket
    // The same instant in UTC really is the small hours → "Still up".
    expect(greetingForTimeZone("UTC", instant)).toBe("Still up");
  });

  it("returns the right bucket across the day in one zone", () => {
    const tz = "America/Los_Angeles";
    expect(greetingForTimeZone(tz, new Date("2026-06-07T15:00:00Z"))).toBe("Good morning"); // 8 AM
    expect(greetingForTimeZone(tz, new Date("2026-06-07T21:00:00Z"))).toBe("Good afternoon"); // 2 PM
  });
});

describe("zonedTimeToUtc", () => {
  it("stores an 11:00 clinic-local slot as the correct UTC instant", () => {
    // 11:00 in LA (PDT, UTC-7) on Jun 10 2026 → 18:00 UTC. The old code parsed
    // the bare string in the server's zone and stored 11:00 UTC (= 4:00 AM PDT).
    const utc = zonedTimeToUtc("America/Los_Angeles", {
      year: 2026,
      month: 6,
      day: 10,
      hour: 11,
      minute: 0,
    });
    expect(utc.toISOString()).toBe("2026-06-10T18:00:00.000Z");
  });

  it("round-trips through getZonedParts", () => {
    const tz = "America/New_York";
    const utc = zonedTimeToUtc(tz, { year: 2026, month: 3, day: 2, hour: 14, minute: 30 });
    const parts = getZonedParts(tz, utc);
    expect(parts).toMatchObject({ year: 2026, month: 3, day: 2, hour: 14, minute: 30 });
  });
});
