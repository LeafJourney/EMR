import { describe, expect, it } from "vitest";
import {
  CALENDAR_BLOCK_PATIENT,
  EXCLUDE_CALENDAR_BLOCK_PATIENT,
  isCalendarBlockPatient,
} from "./calendar-block-patient";

describe("calendar-block placeholder patient", () => {
  it("identifies the placeholder by both name fields", () => {
    expect(isCalendarBlockPatient(CALENDAR_BLOCK_PATIENT)).toBe(true);
    expect(
      isCalendarBlockPatient({ firstName: "System", lastName: "CalendarBlock" }),
    ).toBe(true);
  });

  it("does not flag a real patient who shares only one name field", () => {
    expect(isCalendarBlockPatient({ firstName: "System", lastName: "Reyes" })).toBe(false);
    expect(isCalendarBlockPatient({ firstName: "Maya", lastName: "CalendarBlock" })).toBe(false);
    expect(isCalendarBlockPatient({ firstName: "Maya", lastName: "Reyes" })).toBe(false);
  });

  it("handles null/undefined name fields", () => {
    expect(isCalendarBlockPatient({})).toBe(false);
    expect(isCalendarBlockPatient({ firstName: null, lastName: null })).toBe(false);
  });

  it("exposes a Prisma NOT fragment matching both name fields", () => {
    // The fragment must exclude ONLY rows matching BOTH names, so a real
    // patient sharing one name is never filtered out.
    expect(EXCLUDE_CALENDAR_BLOCK_PATIENT).toEqual({
      NOT: { firstName: "System", lastName: "CalendarBlock" },
    });
  });
});
