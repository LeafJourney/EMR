import { describe, expect, it } from "vitest";
import {
  ageDays,
  ALL_DISCIPLINES,
  daysSinceMovement,
  disciplineFromParam,
  filterQueue,
  isOpen,
  isStale,
  queueSummary,
  rollupByDiscipline,
  sortQueue,
  STALE_THRESHOLD_DAYS,
  validateSignOff,
  type AncillaryReferral,
} from "./ancillary-services";

// EMR-062 — ancillary services queue logic

const NOW = new Date("2026-05-12T00:00:00Z");
const daysAgoIso = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

function r(over: Partial<AncillaryReferral> = {}): AncillaryReferral {
  return {
    id: over.id ?? "r-1",
    discipline: over.discipline ?? "pt",
    patientName: over.patientName ?? "Rivera, M.",
    orderedByUserId: over.orderedByUserId ?? "u-pcp",
    reason: over.reason ?? "Knee rehab",
    status: over.status ?? "pending",
    orderedAt: over.orderedAt ?? daysAgoIso(5),
    lastActivityAt: over.lastActivityAt,
    nextStep: over.nextStep,
  };
}

describe("isOpen", () => {
  it.each(["pending", "scheduled", "in_progress"] as const)(
    "%s is open",
    (s) => expect(isOpen(r({ status: s }))).toBe(true),
  );
  it.each(["completed", "declined"] as const)("%s is closed", (s) =>
    expect(isOpen(r({ status: s }))).toBe(false),
  );
});

describe("ageDays / daysSinceMovement", () => {
  it("computes age from orderedAt", () => {
    expect(ageDays(r({ orderedAt: daysAgoIso(10) }), NOW)).toBe(10);
  });

  it("uses orderedAt when lastActivityAt is absent", () => {
    expect(daysSinceMovement(r({ orderedAt: daysAgoIso(7) }), NOW)).toBe(7);
  });

  it("uses lastActivityAt when present", () => {
    expect(
      daysSinceMovement(
        r({ orderedAt: daysAgoIso(30), lastActivityAt: daysAgoIso(3) }),
        NOW,
      ),
    ).toBe(3);
  });

  it("never returns a negative value for future-dated entries", () => {
    expect(ageDays(r({ orderedAt: daysAgoIso(-5) }), NOW)).toBe(0);
  });
});

describe("isStale", () => {
  it("returns true when open and no movement for threshold+ days", () => {
    expect(
      isStale(r({ status: "in_progress", lastActivityAt: daysAgoIso(STALE_THRESHOLD_DAYS) }), NOW),
    ).toBe(true);
  });

  it("returns false for completed referrals regardless of age", () => {
    expect(
      isStale(r({ status: "completed", lastActivityAt: daysAgoIso(60) }), NOW),
    ).toBe(false);
  });

  it("returns false when recent activity", () => {
    expect(
      isStale(r({ status: "in_progress", lastActivityAt: daysAgoIso(3) }), NOW),
    ).toBe(false);
  });
});

describe("sortQueue", () => {
  it("puts stale items before fresh ones", () => {
    const fresh = r({ id: "fresh", status: "in_progress", lastActivityAt: daysAgoIso(1) });
    const stale = r({ id: "stale", status: "in_progress", lastActivityAt: daysAgoIso(30) });
    const sorted = sortQueue([fresh, stale], NOW);
    expect(sorted[0]!.id).toBe("stale");
  });

  it("breaks ties by status priority then by oldest order", () => {
    const a = r({ id: "a", status: "pending", orderedAt: daysAgoIso(2) });
    const b = r({ id: "b", status: "pending", orderedAt: daysAgoIso(5) });
    const c = r({ id: "c", status: "scheduled", orderedAt: daysAgoIso(10) });
    const sorted = sortQueue([c, a, b], NOW);
    expect(sorted.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
});

describe("filterQueue", () => {
  const set = [
    r({ id: "pt-1", discipline: "pt", status: "pending" }),
    r({ id: "ot-1", discipline: "ot", status: "completed" }),
    r({ id: "hh-1", discipline: "home_health", status: "in_progress" }),
  ];

  it("filters by discipline", () => {
    expect(filterQueue(set, { discipline: "pt" }).map((x) => x.id)).toEqual(["pt-1"]);
  });

  it("filters by status", () => {
    expect(filterQueue(set, { status: "completed" }).map((x) => x.id)).toEqual(["ot-1"]);
  });

  it("openOnly drops completed", () => {
    const ids = filterQueue(set, { openOnly: true }).map((x) => x.id);
    expect(ids).toContain("pt-1");
    expect(ids).toContain("hh-1");
    expect(ids).not.toContain("ot-1");
  });
});

describe("rollupByDiscipline", () => {
  it("aggregates caseload, pending, stale across each discipline", () => {
    const items = [
      r({ id: "1", discipline: "pt", status: "pending" }),
      r({ id: "2", discipline: "pt", status: "in_progress", lastActivityAt: daysAgoIso(30) }),
      r({ id: "3", discipline: "ot", status: "completed" }),
      r({ id: "4", discipline: "home_health", status: "scheduled" }),
    ];
    const out = rollupByDiscipline(items, NOW);
    const pt = out.find((x) => x.discipline === "pt")!;
    expect(pt.caseload).toBe(2);
    expect(pt.pendingIntake).toBe(1);
    expect(pt.staleCount).toBe(1);
    const ot = out.find((x) => x.discipline === "ot")!;
    expect(ot.caseload).toBe(0); // completed isn't open
    const hh = out.find((x) => x.discipline === "home_health")!;
    expect(hh.caseload).toBe(1);
  });

  it("returns one entry per discipline even when empty", () => {
    const out = rollupByDiscipline([], NOW);
    expect(out.length).toBe(5);
    expect(out.every((x) => x.caseload === 0)).toBe(true);
  });
});

describe("disciplineFromParam", () => {
  it("accepts each known discipline", () => {
    for (const d of ALL_DISCIPLINES) {
      expect(disciplineFromParam(d)).toBe(d);
    }
  });

  it("returns undefined for unknown / missing values", () => {
    expect(disciplineFromParam(undefined)).toBeUndefined();
    expect(disciplineFromParam("cardiology")).toBeUndefined();
    expect(disciplineFromParam("")).toBeUndefined();
  });

  it("uses the first value when given a repeated query param", () => {
    expect(disciplineFromParam(["ot", "pt"])).toBe("ot");
    expect(disciplineFromParam(["bogus", "pt"])).toBeUndefined();
  });
});

describe("queueSummary", () => {
  it("counts open caseload, pending intake, and stale across the set", () => {
    const items = [
      r({ id: "1", status: "pending", orderedAt: daysAgoIso(2) }),
      r({ id: "2", status: "in_progress", lastActivityAt: daysAgoIso(30) }),
      r({ id: "3", status: "completed" }),
      r({ id: "4", status: "scheduled", lastActivityAt: daysAgoIso(1) }),
    ];
    const s = queueSummary(items, NOW);
    expect(s.activeCaseload).toBe(3); // pending + in_progress + scheduled
    expect(s.open).toBe(3);
    expect(s.pendingIntake).toBe(1);
    expect(s.stale).toBe(1); // only the 30-day in_progress
  });

  it("is all-zero for an empty queue", () => {
    expect(queueSummary([], NOW)).toEqual({
      activeCaseload: 0,
      pendingIntake: 0,
      open: 0,
      stale: 0,
    });
  });
});

describe("validateSignOff", () => {
  it("accepts a complete sign-off", () => {
    const v = validateSignOff({
      referralId: "ref-1",
      summary: "Six sessions of PT completed with measurable ROM gains.",
      recommendations: ["Continue HEP 5x/week", "Re-eval at PCP visit in 6 weeks"],
      outcome: { instrument: "Oswestry", baseline: 36, current: 18 },
    });
    expect(v.ok).toBe(true);
  });

  it("rejects empty referralId", () => {
    const v = validateSignOff({
      referralId: "  ",
      summary: "Patient completed all sessions without incident or issue.",
      recommendations: ["Recheck in 6w"],
    });
    expect(v.ok).toBe(false);
    expect(v.errors.join("\n")).toMatch(/referralId/);
  });

  it("rejects short summaries", () => {
    const v = validateSignOff({
      referralId: "ref-1",
      summary: "Done.",
      recommendations: ["follow up"],
    });
    expect(v.ok).toBe(false);
    expect(v.errors.join("\n")).toMatch(/summary/);
  });

  it("rejects when no recommendations are provided", () => {
    const v = validateSignOff({
      referralId: "ref-1",
      summary: "Patient completed all sessions without incident or issue.",
      recommendations: [],
    });
    expect(v.ok).toBe(false);
    expect(v.errors.join("\n")).toMatch(/recommendation/);
  });
});
