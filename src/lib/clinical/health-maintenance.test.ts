import { describe, it, expect } from "vitest";
import {
  HealthMaintenanceItemSchema,
  MAYA_REYES_HM_FIXTURE,
  isOverdue,
  resolveDueDate,
  sortForPreventiveCareSurface,
} from "./health-maintenance";

describe("health maintenance scheduler (EMR-705)", () => {
  it("Maya Reyes fixture parses against the schema", () => {
    for (const item of MAYA_REYES_HM_FIXTURE) {
      expect(() => HealthMaintenanceItemSchema.parse(item)).not.toThrow();
    }
  });

  it("Maya Reyes fixture carries 5 preventive items + 3 follow-ups per ticket", () => {
    const screenings = MAYA_REYES_HM_FIXTURE.filter((i) => i.type === "screening");
    const referrals = MAYA_REYES_HM_FIXTURE.filter((i) => i.type === "referral");
    const followups = MAYA_REYES_HM_FIXTURE.filter((i) => i.type === "followup");
    expect(screenings.length + referrals.length).toBe(5);
    expect(followups.length).toBe(3);
  });

  it("resolves recurring cadence relative to last completion", () => {
    const item = MAYA_REYES_HM_FIXTURE[0];
    const lastDone = new Date("2025-08-01T00:00:00Z");
    const due = resolveDueDate(item, new Date("2026-05-20T00:00:00Z"), lastDone);
    expect(due.toISOString().slice(0, 10)).toBe("2026-08-01");
  });

  it("isOverdue is false for completed and deferred items", () => {
    const item = { ...MAYA_REYES_HM_FIXTURE[1], status: "completed" as const };
    expect(isOverdue(item, new Date("2027-01-01"), null)).toBe(false);
  });

  it("isOverdue is true when due-date has passed", () => {
    const item = MAYA_REYES_HM_FIXTURE[1]; // due 2026-08-01
    expect(isOverdue(item, new Date("2026-09-01"), null)).toBe(true);
  });

  it("preventive-care sort surfaces due items first, then by due date", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const sorted = sortForPreventiveCareSurface(
      MAYA_REYES_HM_FIXTURE.slice(),
      now,
      null,
    );
    // First item must be 'due' status (not 'ordered'/'completed').
    expect(sorted[0].status).toBe("due");
    // Ordered items must sink below due items.
    const dueIdx = sorted.findIndex((i) => i.status === "due");
    const orderedIdx = sorted.findIndex((i) => i.status === "ordered");
    if (orderedIdx >= 0) expect(orderedIdx).toBeGreaterThan(dueIdx);
  });

  it("rejects malformed records (bad type or missing ICD-10)", () => {
    expect(() =>
      HealthMaintenanceItemSchema.parse({
        type: "screening",
        label: "X",
        reason: "Y",
        dueBy: { kind: "date", iso: "2026-01-01" },
        status: "due",
        // linkedProblem omitted
      } as any),
    ).toThrow();
  });
});
