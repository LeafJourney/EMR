import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    encounter: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    provider: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));

import {
  ACTIVE_VISIT_STATUSES,
  advanceVisitState,
  assignVisitProvider,
  resolveProviderForUser,
  selectActiveVisitEncounter,
} from "./visit-state";

const { mockPrisma } = hoisted;

const TODAY = new Date("2026-05-29T15:00:00.000Z");

function enc(over: Record<string, unknown> = {}) {
  return {
    id: "enc_1",
    organizationId: "org_1",
    patientId: "patient_1",
    status: "scheduled",
    scheduledFor: TODAY,
    startedAt: null,
    completedAt: null,
    providerId: null,
    renderingProviderId: null,
    briefingContext: null,
    createdAt: TODAY,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.encounter.update.mockImplementation(async ({ where, data }: any) => ({
    ...enc(),
    id: where.id,
    ...data,
  }));
});

describe("selectActiveVisitEncounter", () => {
  it("scopes the lookup to today's non-terminal encounters for the patient + org", async () => {
    mockPrisma.encounter.findMany.mockResolvedValue([]);

    await selectActiveVisitEncounter("patient_1", "org_1", { now: TODAY });

    const arg = mockPrisma.encounter.findMany.mock.calls[0][0];
    expect(arg.where.patientId).toBe("patient_1");
    expect(arg.where.organizationId).toBe("org_1");
    // Every non-terminal status is a candidate — including the front-desk queue
    // flow states (checked_in / rooming / roomed) the patient may already be in
    // — never complete / cancelled / no_show.
    expect(arg.where.status).toEqual({ in: [...ACTIVE_VISIT_STATUSES] });
  });

  it("returns null when there is no active encounter today", async () => {
    mockPrisma.encounter.findMany.mockResolvedValue([]);
    const result = await selectActiveVisitEncounter("patient_1", "org_1", { now: TODAY });
    expect(result).toBeNull();
  });

  it("reuses today's scheduled encounter (so the visit is NOT a fresh row)", async () => {
    const scheduled = enc({ id: "sched_1", status: "scheduled" });
    mockPrisma.encounter.findMany.mockResolvedValue([scheduled]);

    const result = await selectActiveVisitEncounter("patient_1", "org_1", { now: TODAY });
    expect(result?.id).toBe("sched_1");
  });

  it("prefers an already in-progress encounter over a scheduled one", async () => {
    const scheduled = enc({ id: "sched_1", status: "scheduled" });
    const inProgress = enc({ id: "inprog_1", status: "in_progress" });
    mockPrisma.encounter.findMany.mockResolvedValue([scheduled, inProgress]);

    const result = await selectActiveVisitEncounter("patient_1", "org_1", { now: TODAY });
    expect(result?.id).toBe("inprog_1");
  });
});

describe("advanceVisitState", () => {
  it("transitions a scheduled encounter into in_progress and stamps startedAt", async () => {
    const at = new Date("2026-05-29T16:00:00.000Z");
    const { encounter, transitioned } = await advanceVisitState(
      { id: "enc_1", status: "scheduled", startedAt: null },
      "in_visit",
      "user_1",
      { at },
    );

    expect(transitioned).toBe(true);
    expect(mockPrisma.encounter.update).toHaveBeenCalledWith({
      where: { id: "enc_1" },
      data: { status: "in_progress", startedAt: at },
    });
    expect(encounter.status).toBe("in_progress");
  });

  it("is a no-op when the encounter is already in the target status", async () => {
    const { transitioned } = await advanceVisitState(
      { id: "enc_1", status: "in_progress", startedAt: TODAY },
      "in_visit",
      "user_1",
    );
    expect(transitioned).toBe(false);
    expect(mockPrisma.encounter.update).not.toHaveBeenCalled();
  });

  it("completes an in_progress encounter exactly once (idempotent complete)", async () => {
    const at = new Date("2026-05-29T17:00:00.000Z");

    const first = await advanceVisitState(
      { id: "enc_1", status: "in_progress", startedAt: TODAY },
      "complete",
      "user_1",
      { at },
    );
    expect(first.transitioned).toBe(true);
    expect(mockPrisma.encounter.update).toHaveBeenCalledWith({
      where: { id: "enc_1" },
      data: { status: "complete", completedAt: at },
    });

    // Re-issuing complete on an already-complete encounter must not transition.
    const second = await advanceVisitState(
      { id: "enc_1", status: "complete", startedAt: TODAY },
      "complete",
      "user_1",
      { at },
    );
    expect(second.transitioned).toBe(false);
    expect(mockPrisma.encounter.update).toHaveBeenCalledTimes(1);
  });

  it("does not re-stamp startedAt when the encounter already started", async () => {
    await advanceVisitState(
      { id: "enc_1", status: "scheduled", startedAt: TODAY },
      "in_visit",
      "user_1",
      { at: new Date("2026-05-29T18:00:00.000Z") },
    );
    const data = mockPrisma.encounter.update.mock.calls[0][0].data;
    expect(data.startedAt).toBeUndefined();
    expect(data.status).toBe("in_progress");
  });
});

describe("resolveProviderForUser", () => {
  it("scopes the lookup to the user + organization", async () => {
    mockPrisma.provider.findFirst.mockResolvedValue({ id: "prov_1" });
    const r = await resolveProviderForUser("user_1", "org_1");
    expect(r).toEqual({ id: "prov_1" });
    expect(mockPrisma.provider.findFirst).toHaveBeenCalledWith({
      where: { userId: "user_1", organizationId: "org_1" },
      select: { id: true },
    });
  });
});

describe("assignVisitProvider", () => {
  it("is a no-op when the user has no Provider record", async () => {
    const e = enc({ providerId: null }) as any;
    const r = await assignVisitProvider(e, null);
    expect(r).toBe(e);
    expect(mockPrisma.encounter.update).not.toHaveBeenCalled();
  });

  it("claims an unowned encounter (providerId null → currentProviderId)", async () => {
    await assignVisitProvider(enc({ providerId: null }) as any, "prov_x");
    expect(mockPrisma.encounter.update).toHaveBeenCalledWith({
      where: { id: "enc_1" },
      data: { providerId: "prov_x" },
    });
  });

  it("preserves a DIFFERENT owner and stamps renderingProviderId", async () => {
    await assignVisitProvider(
      enc({ providerId: "prov_a", renderingProviderId: null }) as any,
      "prov_b",
    );
    expect(mockPrisma.encounter.update).toHaveBeenCalledWith({
      where: { id: "enc_1" },
      data: { renderingProviderId: "prov_b" },
    });
  });

  it("is a no-op when the current user already owns the encounter", async () => {
    await assignVisitProvider(enc({ providerId: "prov_b" }) as any, "prov_b");
    expect(mockPrisma.encounter.update).not.toHaveBeenCalled();
  });

  it("is a no-op when the current user is already the rendering provider", async () => {
    await assignVisitProvider(
      enc({ providerId: "prov_a", renderingProviderId: "prov_b" }) as any,
      "prov_b",
    );
    expect(mockPrisma.encounter.update).not.toHaveBeenCalled();
  });
});

describe("ACTIVE_VISIT_STATUSES", () => {
  it("covers every non-terminal persisted status and excludes terminal ones", () => {
    // The front-desk queue board persists checked_in..roomed/wrap_up onto the
    // encounter row, so a reusable "active" encounter can be in any of these.
    expect([...ACTIVE_VISIT_STATUSES]).toEqual([
      "scheduled",
      "checked_in",
      "info_incomplete",
      "ready",
      "rooming",
      "roomed",
      "in_visit",
      "wrap_up",
      "in_progress",
    ]);
    for (const terminal of ["complete", "cancelled", "no_show"]) {
      expect(ACTIVE_VISIT_STATUSES).not.toContain(terminal);
    }
  });
});
