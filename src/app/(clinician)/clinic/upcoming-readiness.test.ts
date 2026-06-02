import { describe, expect, it } from "vitest";

import {
  buildUpcomingMissingRows,
  whenLabel,
  type UpcomingReadinessItem,
} from "./upcoming-readiness";

const NOW = new Date("2026-06-01T12:00:00.000Z");

function item(over: Partial<UpcomingReadinessItem> = {}): UpcomingReadinessItem {
  return {
    appointmentId: "appt_1",
    patientId: "pat_1",
    firstName: "Maya",
    lastName: "Singh",
    startAt: new Date("2026-06-04T16:00:00.000Z"), // 3 days out
    readiness: { isReady: false, missingRequiredIds: ["consent"], outstandingRequiredCount: 1, completionPct: 0.75 },
    missingRequirements: [{ id: "consent", label: "Visit consent", href: "/patient/consents" }],
    ...over,
  };
}

describe("buildUpcomingMissingRows", () => {
  it("excludes ready patients and those with nothing outstanding", () => {
    const rows = buildUpcomingMissingRows(
      [
        item({ appointmentId: "ready", readiness: { isReady: true, missingRequiredIds: [], outstandingRequiredCount: 0, completionPct: 1 } }),
        item({ appointmentId: "empty", missingRequirements: [] }),
        item({ appointmentId: "keep" }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.appointmentId)).toEqual(["keep"]);
  });

  it("orders soonest-first and shapes the row (name, when, labels, pct)", () => {
    const rows = buildUpcomingMissingRows(
      [
        item({ appointmentId: "later", startAt: new Date("2026-06-08T10:00:00Z") }),
        item({
          appointmentId: "sooner",
          startAt: new Date("2026-06-02T10:00:00Z"),
          firstName: "Ada",
          lastName: "Lovelace",
          missingRequirements: [
            { id: "consent", label: "Visit consent", href: "/patient/consents" },
            { id: "presenting_concerns", label: "Reason for this visit", href: "/patient/intake/concerns" },
          ],
          readiness: { isReady: false, missingRequiredIds: ["consent", "presenting_concerns"], outstandingRequiredCount: 2, completionPct: 0.5 },
        }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.appointmentId)).toEqual(["sooner", "later"]);
    expect(rows[0]).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      whenLabel: "tomorrow",
      missingLabels: ["Visit consent", "Reason for this visit"],
      outstandingCount: 2,
      completionPct: 50,
    });
  });

  it("caps the number of rows", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      item({ appointmentId: `a${i}`, startAt: new Date(NOW.getTime() + (i + 1) * 3600_000) }),
    );
    expect(buildUpcomingMissingRows(many, NOW, 8)).toHaveLength(8);
  });
});

describe("whenLabel", () => {
  it("frames today / tomorrow / multi-day by UTC calendar day", () => {
    expect(whenLabel(new Date("2026-06-01T20:00:00Z"), NOW)).toBe("today");
    expect(whenLabel(new Date("2026-06-02T08:00:00Z"), NOW)).toBe("tomorrow");
    expect(whenLabel(new Date("2026-06-06T08:00:00Z"), NOW)).toBe("in 5 days");
  });
});
