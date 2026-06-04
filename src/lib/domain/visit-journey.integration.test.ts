import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Same-day care-journey integration spine.
 *
 * Drives the REAL visit-state functions (computeQueueTransition,
 * selectActiveVisitEncounter, advanceVisitState, assignVisitProvider) against an
 * in-memory Encounter table that mutates like Prisma would, then walks one
 * patient through the whole journey:
 *
 *   scheduled → checked_in (front desk) → rooming → roomed (MA + handoff)
 *            → Start Visit (physician REUSES the roomed encounter)
 *            → in_progress → complete (note finalized)
 *
 * The crux: at Start Visit the physician must reuse the encounter the front
 * desk/MA already advanced — not mint a second one — and the MA's rooming
 * handoff (briefingContext) must survive onto the started visit. This is the
 * end-to-end guard for the duplicate-encounter / orphaned-handoff class of bug.
 */

// Hoisted so the vi.mock factory (which is itself hoisted) can reach the
// in-memory store + prisma double before visit-state.ts is imported.
const h = vi.hoisted(() => {
  const store: any[] = [];

  const inRange = (d: Date | null, r: any): boolean => {
    if (d == null) return false;
    const t = d.getTime();
    if (r.gte && t < r.gte.getTime()) return false;
    if (r.lte && t > r.lte.getTime()) return false;
    return true;
  };

  const matchWhere = (e: any, where: any): boolean => {
    if (!where) return true;
    if (where.id && e.id !== where.id) return false;
    if (where.patientId && e.patientId !== where.patientId) return false;
    if (where.organizationId && e.organizationId !== where.organizationId) return false;
    if (where.status?.in && !where.status.in.includes(e.status)) return false;
    if (typeof where.status === "string" && e.status !== where.status) return false;
    if (where.OR) {
      const ok = where.OR.some((clause: any) =>
        clause.scheduledFor
          ? inRange(e.scheduledFor, clause.scheduledFor)
          : inRange(e.createdAt, clause.createdAt),
      );
      if (!ok) return false;
    }
    return true;
  };

  const selectRows = (where: any, orderBy?: any): any[] => {
    let rows = store.filter((e) => matchWhere(e, where));
    if (orderBy?.scheduledFor) {
      const dir = orderBy.scheduledFor === "desc" ? -1 : 1;
      rows = rows.sort(
        (a, b) =>
          dir * ((a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0)),
      );
    }
    return rows.map((e) => ({ ...e }));
  };

  const prismaMock = {
    encounter: {
      findMany: vi.fn(async ({ where, orderBy }: any) => selectRows(where, orderBy)),
      findFirst: vi.fn(async ({ where, orderBy }: any) => selectRows(where, orderBy)[0] ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const e = store.find((x) => x.id === where.id);
        if (!e) throw new Error(`no encounter ${where.id}`);
        Object.assign(e, data);
        return { ...e };
      }),
      create: vi.fn(async ({ data }: any) => {
        const e = { id: `enc_${store.length + 1}`, ...data };
        store.push(e);
        return { ...e };
      }),
    },
  };

  return { store, prismaMock };
});

const { store, prismaMock } = h;

vi.mock("@/lib/db/prisma", () => ({ prisma: h.prismaMock }));

import {
  computeQueueTransition,
  selectActiveVisitEncounter,
  advanceVisitState,
  assignVisitProvider,
  type VisitSpineStatus,
} from "./visit-state";
import { mapEncounterStatusToQueueStatus } from "./queue-board";

const NOW = new Date("2026-06-03T16:00:00.000Z");
const ORG = "org_1";
const PATIENT = "patient_1";

async function queueMove(id: string, target: VisitSpineStatus) {
  const enc = await prismaMock.encounter.findFirst({ where: { id } });
  const t = computeQueueTransition(enc, target, NOW);
  if (!t.ok) throw new Error(t.error);
  await prismaMock.encounter.update({ where: { id }, data: t.data });
}

function seedScheduled() {
  const enc = {
    id: "enc_1",
    organizationId: ORG,
    patientId: PATIENT,
    providerId: null,
    renderingProviderId: null,
    status: "scheduled",
    scheduledFor: NOW,
    createdAt: NOW,
    startedAt: null,
    completedAt: null,
    briefingContext: null,
  };
  store.push(enc);
  return enc;
}

beforeEach(() => {
  store.length = 0;
  vi.clearAllMocks();
});

describe("same-day care journey", () => {
  it("walks scheduled → checked_in → roomed → Start Visit (reuse) → complete with no duplicate encounter", async () => {
    seedScheduled();

    // Front desk checks the patient in.
    await queueMove("enc_1", "checked_in");
    // MA rooms the patient and leaves a handoff (vitals + note) in briefingContext.
    await queueMove("enc_1", "rooming");
    await queueMove("enc_1", "roomed");
    await prismaMock.encounter.update({
      where: { id: "enc_1" },
      data: {
        briefingContext: {
          rooming: { room: "A3", handoffNote: "BP a little high", vitals: { systolic: 142 } },
        },
      },
    });

    // Physician Start Visit — must find the roomed encounter, not mint a new one.
    const selected = await selectActiveVisitEncounter(PATIENT, ORG, { now: NOW });
    expect(selected).not.toBeNull();
    expect(selected!.id).toBe("enc_1");

    const advanced = (await advanceVisitState(selected!, "in_visit", "doc_1")).encounter;
    const withProvider = await assignVisitProvider(advanced, "prov_1");

    // Exactly one encounter exists — no duplicate.
    expect(store).toHaveLength(1);
    const enc = store[0];
    expect(enc.status).toBe("in_progress");
    expect(enc.startedAt).toBeInstanceOf(Date);
    expect(enc.providerId).toBe("prov_1");
    // The MA handoff survived onto the started visit.
    expect(enc.briefingContext.rooming.handoffNote).toBe("BP a little high");
    expect(withProvider.id).toBe("enc_1");

    // Every flow-state timestamp was stamped along the way.
    expect(enc.checkedInAt).toBeInstanceOf(Date);
    expect(enc.roomingStartedAt).toBeInstanceOf(Date);
    expect(enc.roomedAt).toBeInstanceOf(Date);

    // Finalizing the note completes the encounter.
    const completion = await advanceVisitState(enc, "complete", "doc_1", { at: NOW });
    expect(completion.transitioned).toBe(true);
    expect(store[0].status).toBe("complete");
    expect(store[0].completedAt).toBeInstanceOf(Date);

    // A completed visit drops off the active selector and shows "Done" on the board.
    const afterComplete = await selectActiveVisitEncounter(PATIENT, ORG, { now: NOW });
    expect(afterComplete).toBeNull();
    expect(mapEncounterStatusToQueueStatus(store[0].status)).toBe("completed");
  });

  it("repeat Start Visit clicks reuse the in-progress encounter (no duplicate)", async () => {
    seedScheduled();
    await queueMove("enc_1", "checked_in");
    await queueMove("enc_1", "rooming");
    await queueMove("enc_1", "roomed");

    // First click.
    const first = await selectActiveVisitEncounter(PATIENT, ORG, { now: NOW });
    const a = (await advanceVisitState(first!, "in_visit", "doc_1")).encounter;
    expect(a.status).toBe("in_progress");

    // Second click (double-submit / refresh-then-click).
    const second = await selectActiveVisitEncounter(PATIENT, ORG, { now: NOW });
    expect(second!.id).toBe("enc_1");
    const b = await advanceVisitState(second!, "in_visit", "doc_1");
    // Already in-progress → idempotent, no state change.
    expect(b.transitioned).toBe(false);

    expect(store).toHaveLength(1);
  });

  it("Start Visit for a walk-in (no prior encounter) mints exactly one and reuses it on the next click", async () => {
    // No seed — walk-in with nothing scheduled.
    let encounter = await selectActiveVisitEncounter(PATIENT, ORG, { now: NOW });
    expect(encounter).toBeNull();

    // Caller mints the encounter (as startVisit does when selection is null).
    encounter = await prismaMock.encounter.create({
      data: {
        organizationId: ORG,
        patientId: PATIENT,
        status: "in_progress",
        scheduledFor: NOW,
        createdAt: NOW,
        startedAt: NOW,
        providerId: "prov_1",
      },
    });
    expect(store).toHaveLength(1);

    // A second click now finds the just-created encounter instead of duplicating.
    const again = await selectActiveVisitEncounter(PATIENT, ORG, { now: NOW });
    expect(again!.id).toBe(encounter!.id);
    expect(store).toHaveLength(1);
  });

  it("does not reuse another patient's roomed encounter", async () => {
    seedScheduled();
    await queueMove("enc_1", "checked_in");
    await queueMove("enc_1", "rooming");
    await queueMove("enc_1", "roomed");

    const other = await selectActiveVisitEncounter("patient_2", ORG, { now: NOW });
    expect(other).toBeNull();
  });
});
