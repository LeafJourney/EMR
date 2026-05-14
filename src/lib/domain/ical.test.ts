import { describe, it, expect } from "vitest";
import { buildIcs, type IcsEvent } from "./ical";

const SAMPLE_EVENT: IcsEvent = {
  uid: "appt-123@leafjourney.com",
  start: new Date(Date.UTC(2026, 4, 20, 17, 0, 0)),
  end: new Date(Date.UTC(2026, 4, 20, 17, 30, 0)),
  summary: "Follow-up visit",
};

describe("buildIcs", () => {
  it("wraps a single event in a VCALENDAR/VEVENT envelope", () => {
    const ics = buildIcs([SAMPLE_EVENT]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("END:VEVENT\r\n");
    expect(ics).toContain("UID:appt-123@leafjourney.com\r\n");
    expect(ics).toContain("DTSTART:20260520T170000Z\r\n");
    expect(ics).toContain("DTEND:20260520T173000Z\r\n");
  });

  it("uses CRLF line endings throughout", () => {
    const ics = buildIcs([SAMPLE_EVENT]);
    expect(ics.split("\n").every((segment) => segment === "" || segment.endsWith("\r"))).toBe(true);
  });

  it("includes optional fields when supplied", () => {
    const ics = buildIcs([
      {
        ...SAMPLE_EVENT,
        description: "Discuss sleep regimen, dose adjustments.",
        location: "Telehealth",
        url: "https://leafjourney.com/portal",
        organizerName: "Dr. Patel",
        organizerEmail: "patel@leafjourney.com",
      },
    ]);
    expect(ics).toContain("DESCRIPTION:Discuss sleep regimen\\, dose adjustments.");
    expect(ics).toContain("LOCATION:Telehealth");
    expect(ics).toContain("URL:https://leafjourney.com/portal");
    expect(ics).toContain("ORGANIZER;CN=Dr. Patel:mailto:patel@leafjourney.com");
  });

  it("escapes commas, semicolons, backslashes, and newlines in TEXT fields", () => {
    const ics = buildIcs([
      {
        ...SAMPLE_EVENT,
        summary: "a, b; c\\d\ne",
      },
    ]);
    expect(ics).toContain("SUMMARY:a\\, b\\; c\\\\d\\ne");
  });

  it("folds long DESCRIPTION lines per RFC 5545", () => {
    const description = "x".repeat(200);
    const ics = buildIcs([{ ...SAMPLE_EVENT, description }]);
    // Find the DESCRIPTION property and assert the next physical line begins with a space.
    const idx = ics.indexOf("DESCRIPTION:");
    const segment = ics.slice(idx, idx + 230);
    const lines = segment.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[1].startsWith(" ")).toBe(true);
  });

  it("emits multiple events in a single calendar", () => {
    const ics = buildIcs([
      SAMPLE_EVENT,
      { ...SAMPLE_EVENT, uid: "appt-2@leafjourney.com" },
    ]);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect(ics).toContain("UID:appt-2@leafjourney.com");
  });

  it("uses a custom calendar name when provided", () => {
    const ics = buildIcs([SAMPLE_EVENT], { calendarName: "Mira's visits" });
    expect(ics).toContain("X-WR-CALNAME:Mira's visits");
  });
});
