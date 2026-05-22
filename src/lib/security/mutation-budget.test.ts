// EMR-730 — Unit tests for the mutation-budget pure helpers.
//
// Three behaviours under test:
//   1. Threshold env parsing — defaults, well-formed overrides, bad values.
//   2. Window counting — 1-min vs 5-min with mocked timestamps.
//   3. Dedupe ledger — first fire, within-window suppression, after-window re-fire.

import { describe, it, expect, vi } from "vitest";

import {
  aggregatePerActor,
  DEDUPE_WINDOW_MS,
  DEFAULT_PER_5MIN,
  DEFAULT_PER_MIN,
  exceedsBudget,
  isSuppressedByDedupe,
  loadThresholds,
  type AuditRow,
} from "./mutation-budget";

const NOW = new Date("2026-05-17T12:00:00.000Z");

function row(actorUserId: string, secondsAgo: number, action = "controller.config.publish", actorEmail: string | null = `${actorUserId}@example.com`): AuditRow {
  return {
    at: new Date(NOW.getTime() - secondsAgo * 1_000),
    actorUserId,
    actorEmail,
    action,
  };
}

describe("loadThresholds", () => {
  it("returns defaults when env is empty", () => {
    const t = loadThresholds({});
    expect(t.perMin).toBe(DEFAULT_PER_MIN);
    expect(t.per5Min).toBe(DEFAULT_PER_5MIN);
  });

  it("parses valid positive integers", () => {
    const t = loadThresholds({
      SUPER_ADMIN_ALARM_PER_MIN: "12",
      SUPER_ADMIN_ALARM_PER_5MIN: "55",
    });
    expect(t.perMin).toBe(12);
    expect(t.per5Min).toBe(55);
  });

  it.each([
    ["abc"],
    ["0"],
    ["-5"],
    ["3.14"],
    [""],
  ])("falls back to default when value is %j", (raw) => {
    const warn = vi.fn();
    const t = loadThresholds({ SUPER_ADMIN_ALARM_PER_MIN: raw }, { warn });
    expect(t.perMin).toBe(DEFAULT_PER_MIN);
    // "" is treated as "not set" → no warning; the others warn.
    if (raw !== "") {
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "mutation_budget.threshold_unparseable",
          envKey: "SUPER_ADMIN_ALARM_PER_MIN",
          raw,
        }),
      );
    } else {
      expect(warn).not.toHaveBeenCalled();
    }
  });
});

describe("aggregatePerActor", () => {
  it("counts rows in the 1-min and 5-min windows separately", () => {
    const rows: AuditRow[] = [
      // Actor A: 3 in last 30s, 5 more between 1-4 min ago → 3/min, 8/5min.
      row("A", 5),
      row("A", 10),
      row("A", 25),
      row("A", 90),
      row("A", 120),
      row("A", 180),
      row("A", 200),
      row("A", 240),
      // Actor B: 1 in last 30s only.
      row("B", 15),
      // Out of window (older than 5 min) — must be excluded.
      row("A", 400),
    ];

    const result = aggregatePerActor(rows, NOW);
    const a = result.get("A")!;
    const b = result.get("B")!;

    expect(a.perMin).toBe(3);
    expect(a.per5Min).toBe(8);
    expect(b.perMin).toBe(1);
    expect(b.per5Min).toBe(1);
  });

  it("returns up to 5 distinct most-recent actions in sampleActions", () => {
    const rows: AuditRow[] = [
      row("A", 5, "controller.template.create"),
      row("A", 10, "controller.config.publish"),
      row("A", 20, "controller.config.publish"), // dup — should be deduped
      row("A", 30, "controller.config.archive"),
      row("A", 40, "controller.wizard.step.save"),
      row("A", 50, "controller.config.rollback"),
      row("A", 60, "controller.template.update"),
    ];
    const a = aggregatePerActor(rows, NOW).get("A")!;
    expect(a.sampleActions).toHaveLength(5);
    expect(a.sampleActions[0]).toBe("controller.template.create");
    // No duplicate of controller.config.publish.
    expect(a.sampleActions.filter((x) => x === "controller.config.publish")).toHaveLength(1);
  });

  it("includes the firing actor when 31 mutations land inside 50 seconds", () => {
    // AC repro: one actor, 31 mutations over 50s — perMin > 30 must trip.
    const rows: AuditRow[] = Array.from({ length: 31 }, (_, i) =>
      row("compromised_admin", (50 / 31) * i),
    );
    const counts = aggregatePerActor(rows, NOW).get("compromised_admin")!;
    expect(counts.perMin).toBe(31);
    expect(exceedsBudget(counts, { perMin: DEFAULT_PER_MIN, per5Min: DEFAULT_PER_5MIN })).toBe(true);
  });
});

describe("exceedsBudget", () => {
  it("trips when perMin exceeds threshold", () => {
    expect(
      exceedsBudget(
        { actorUserId: "A", actorEmail: null, perMin: 31, per5Min: 31, sampleActions: [] },
        { perMin: 30, per5Min: 100 },
      ),
    ).toBe(true);
  });

  it("trips when per5Min exceeds threshold even if perMin is fine", () => {
    expect(
      exceedsBudget(
        { actorUserId: "A", actorEmail: null, perMin: 10, per5Min: 101, sampleActions: [] },
        { perMin: 30, per5Min: 100 },
      ),
    ).toBe(true);
  });

  it("does not trip when both counts equal thresholds (strict >)", () => {
    expect(
      exceedsBudget(
        { actorUserId: "A", actorEmail: null, perMin: 30, per5Min: 100, sampleActions: [] },
        { perMin: 30, per5Min: 100 },
      ),
    ).toBe(false);
  });
});

describe("isSuppressedByDedupe", () => {
  it("does not suppress on first-ever fire (no prior row)", () => {
    expect(isSuppressedByDedupe(null, NOW)).toBe(false);
  });

  it("suppresses within the 10-minute window", () => {
    const fiveMinAgo = new Date(NOW.getTime() - 5 * 60 * 1_000);
    expect(isSuppressedByDedupe(fiveMinAgo, NOW)).toBe(true);
  });

  it("re-fires after the 10-minute window has elapsed", () => {
    const justOver = new Date(NOW.getTime() - DEDUPE_WINDOW_MS - 1);
    expect(isSuppressedByDedupe(justOver, NOW)).toBe(false);
  });

  it("treats the boundary itself as expired (strict <)", () => {
    const exactBoundary = new Date(NOW.getTime() - DEDUPE_WINDOW_MS);
    expect(isSuppressedByDedupe(exactBoundary, NOW)).toBe(false);
  });
});
