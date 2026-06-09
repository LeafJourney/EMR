import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Duplicate-encounter regression — physician visit spine.
 *
 * The front-desk queue board PERSISTS intermediate flow states
 * (checked_in / info_incomplete / ready / rooming / roomed / wrap_up) directly
 * onto the Encounter row via computeQueueTransition. `selectActiveVisitEncounter`
 * is what Start Visit / the briefing / readiness use to find today's encounter
 * BEFORE minting a new one. If its status filter omits those queue states, a
 * checked-in or roomed patient is invisible to the physician → Start Visit
 * creates a SECOND encounter, duplicating the visit and orphaning the rooming
 * vitals + MA handoff stored in the first encounter's briefingContext.
 *
 * These tests drive the *real* WHERE clause: the prisma mock replicates Prisma's
 * `status { in }` + today-bounds filtering, so a too-narrow filter makes the
 * roomed/checked-in cases return null and the assertions fail.
 */

const hoisted = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { encounter: { findMany: hoisted.findMany } },
}));

import {
  selectActiveVisitEncounter,
  ACTIVE_VISIT_STATUSES,
  TERMINAL_VISIT_STATUSES,
} from "./visit-state";

const NOW = new Date("2026-06-03T17:00:00.000Z");

function enc(over: Record<string, unknown> = {}) {
  return {
    id: "e1",
    organizationId: "org_1",
    patientId: "pat_1",
    status: "scheduled",
    scheduledFor: NOW,
    createdAt: NOW,
    startedAt: null,
    ...over,
  };
}

// Replicate the parts of Prisma's WHERE that selectActiveVisitEncounter relies
// on so the test exercises the production filter, not the mock's canned return:
//   - patientId / organizationId equality
//   - status { in: [...] }
//   - OR [{ scheduledFor in day }, { createdAt in day }]
//   - orderBy scheduledFor asc
function applyFilter(rows: any[], where: any) {
  const allowed: string[] = where.status.in;
  const within = (d: Date | null, range: any) =>
    d != null && d >= range.gte && d <= range.lte;
  return rows
    .filter(
      (e) =>
        e.patientId === where.patientId &&
        e.organizationId === where.organizationId &&
        allowed.includes(e.status) &&
        where.OR.some((clause: any) =>
          clause.scheduledFor
            ? within(e.scheduledFor, clause.scheduledFor)
            : within(e.createdAt, clause.createdAt),
        ),
    )
    .sort(
      (a, b) =>
        (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0),
    );
}

function mockStore(rows: any[]) {
  hoisted.findMany.mockImplementation(async ({ where }: any) =>
    applyFilter(rows, where),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("selectActiveVisitEncounter — reuses front-desk queue states", () => {
  it.each(["checked_in", "info_incomplete", "ready", "rooming", "roomed", "wrap_up"])(
    "reuses today's %s encounter (front desk already advanced it past scheduled)",
    async (status) => {
      mockStore([enc({ id: "live", status })]);
      const got = await selectActiveVisitEncounter("pat_1", "org_1", { now: NOW });
      expect(got?.id).toBe("live");
    },
  );

  it("reuses a walk-in encounter created today even with no scheduledFor", async () => {
    mockStore([enc({ id: "walkin", status: "checked_in", scheduledFor: null })]);
    const got = await selectActiveVisitEncounter("pat_1", "org_1", { now: NOW });
    expect(got?.id).toBe("walkin");
  });

  it.each([...TERMINAL_VISIT_STATUSES])(
    "does NOT resume a terminal %s encounter (caller mints a fresh one)",
    async (status) => {
      mockStore([enc({ id: "done", status })]);
      const got = await selectActiveVisitEncounter("pat_1", "org_1", { now: NOW });
      expect(got).toBeNull();
    },
  );

  it("prefers an already in-progress encounter over a separate scheduled one", async () => {
    mockStore([
      enc({ id: "sched", status: "scheduled", scheduledFor: new Date("2026-06-03T16:00:00Z") }),
      enc({ id: "live", status: "in_progress", scheduledFor: new Date("2026-06-03T18:00:00Z") }),
    ]);
    const got = await selectActiveVisitEncounter("pat_1", "org_1", { now: NOW });
    expect(got?.id).toBe("live");
  });

  it("ignores another patient's / another org's encounter", async () => {
    mockStore([
      enc({ id: "other_pat", patientId: "pat_2", status: "roomed" }),
      enc({ id: "other_org", organizationId: "org_2", status: "roomed" }),
    ]);
    const got = await selectActiveVisitEncounter("pat_1", "org_1", { now: NOW });
    expect(got).toBeNull();
  });

  it("queries with the full non-terminal status set (guards against re-narrowing)", async () => {
    mockStore([]);
    await selectActiveVisitEncounter("pat_1", "org_1", { now: NOW });
    const where = hoisted.findMany.mock.calls[0][0].where;
    for (const s of ["checked_in", "info_incomplete", "ready", "rooming", "roomed", "wrap_up"]) {
      expect(where.status.in).toContain(s);
    }
    for (const t of TERMINAL_VISIT_STATUSES) {
      expect(where.status.in).not.toContain(t);
    }
    // The exported constant and the executed query must stay in agreement.
    expect(new Set(where.status.in)).toEqual(new Set(ACTIVE_VISIT_STATUSES));
  });
});
