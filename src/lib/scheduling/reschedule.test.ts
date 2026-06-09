import { describe, it, expect } from "vitest";
import { rescheduleToDay } from "./reschedule";

describe("rescheduleToDay (EMR-921/578 drag-to-reschedule date math)", () => {
  it("preserves time-of-day + duration and swaps the calendar date", () => {
    const start = new Date(2026, 5, 8, 14, 30); // Mon Jun 8 2026, 2:30pm
    const end = new Date(2026, 5, 8, 15, 0); // 30 min
    const target = new Date(2026, 5, 11, 0, 0); // Thu Jun 11

    const r = rescheduleToDay(start, end, target);

    expect(r.start.getFullYear()).toBe(2026);
    expect(r.start.getMonth()).toBe(5);
    expect(r.start.getDate()).toBe(11);
    expect(r.start.getHours()).toBe(14);
    expect(r.start.getMinutes()).toBe(30);
    expect(r.end.getTime() - r.start.getTime()).toBe(30 * 60 * 1000);
    expect(r.moved).toBe(true);
  });

  it("is a no-op (moved=false) when the target is the same calendar day", () => {
    const start = new Date(2026, 5, 8, 9, 0);
    const end = new Date(2026, 5, 8, 9, 30);
    const target = new Date(2026, 5, 8, 23, 59); // same day, later wall-clock

    const r = rescheduleToDay(start, end, target);

    expect(r.moved).toBe(false);
    expect(r.start.getTime()).toBe(start.getTime());
    expect(r.end.getTime()).toBe(end.getTime());
  });

  it("preserves a multi-hour duration across a month boundary", () => {
    const start = new Date(2026, 0, 31, 8, 0); // Jan 31, 8:00am
    const end = new Date(2026, 0, 31, 10, 15); // 2h15m
    const target = new Date(2026, 1, 2); // Feb 2

    const r = rescheduleToDay(start, end, target);

    expect(r.start.getMonth()).toBe(1);
    expect(r.start.getDate()).toBe(2);
    expect(r.start.getHours()).toBe(8);
    expect(r.start.getMinutes()).toBe(0);
    expect(r.end.getTime() - r.start.getTime()).toBe((2 * 60 + 15) * 60 * 1000);
    expect(r.moved).toBe(true);
  });
});
