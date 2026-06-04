import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hardening sprint — physician visit spine.
 * startVisit must reuse today's existing scheduled/in_progress encounter
 * instead of minting a duplicate, and expose a readiness handoff.
 */
const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    patient: { findFirst: vi.fn() },
    encounter: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    note: { findFirst: vi.fn() },
    agentJob: { findMany: vi.fn() },
    provider: { findFirst: vi.fn() },
  };
  return {
    mockPrisma,
    requireUserMock: vi.fn(),
    dispatchMock: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));
vi.mock("@/lib/orchestration/dispatch", () => ({ dispatch: hoisted.dispatchMock }));
vi.mock("@/lib/observability/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { startVisit, getVisitReadiness } from "./actions";

const { mockPrisma, requireUserMock, dispatchMock } = hoisted;

const TODAY = new Date("2026-05-29T15:00:00.000Z");

function clinician(over: Record<string, unknown> = {}) {
  return {
    id: "user_1",
    email: "doc@example.com",
    firstName: "Cli",
    lastName: "Nician",
    roles: ["clinician"],
    organizationId: "org_1",
    organizationName: "Clinic",
    ...over,
  };
}

function patient(over: Record<string, unknown> = {}) {
  return {
    id: "patient_1",
    organizationId: "org_1",
    chartRestricted: false,
    restrictedProviderIds: [],
    chartRestrictedReason: null,
    ...over,
  };
}

function scheduledEncounter(over: Record<string, unknown> = {}) {
  return {
    id: "sched_1",
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
  requireUserMock.mockResolvedValue(clinician());
  mockPrisma.patient.findFirst.mockResolvedValue(patient());
  mockPrisma.encounter.findFirst.mockResolvedValue(null);
  mockPrisma.encounter.findMany.mockResolvedValue([]);
  mockPrisma.provider.findFirst.mockResolvedValue(null);
  mockPrisma.encounter.update.mockImplementation(async ({ where, data }: any) => ({
    ...scheduledEncounter(),
    id: where.id,
    ...data,
  }));
  mockPrisma.encounter.create.mockResolvedValue(scheduledEncounter({ id: "new_enc", status: "in_progress" }));
  mockPrisma.note.findFirst.mockResolvedValue(null);
  mockPrisma.agentJob.findMany.mockResolvedValue([]);
  dispatchMock.mockResolvedValue([]);
});

describe("startVisit — encounter selection", () => {
  it("reuses today's scheduled encounter instead of creating a duplicate", async () => {
    mockPrisma.encounter.findMany.mockResolvedValue([scheduledEncounter()]);

    await expect(startVisit("patient_1")).rejects.toThrow(/redirect:/);

    expect(mockPrisma.encounter.create).not.toHaveBeenCalled();
    // The reused encounter is advanced into the visit.
    expect(mockPrisma.encounter.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sched_1" } }),
    );
  });

  it("advances a reused scheduled encounter before short-circuiting to its note", async () => {
    mockPrisma.encounter.findMany.mockResolvedValue([scheduledEncounter()]);
    mockPrisma.note.findFirst.mockResolvedValue({ id: "note_9" });

    await expect(startVisit("patient_1")).rejects.toThrow(/notes\/note_9/);

    // The encounter must be marked in-progress even though we jump to the note.
    expect(mockPrisma.encounter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sched_1" },
        data: expect.objectContaining({ status: "in_progress" }),
      }),
    );
  });

  it("creates a fresh in_progress encounter only when none exists today", async () => {
    mockPrisma.encounter.findMany.mockResolvedValue([]);

    await expect(startVisit("patient_1")).rejects.toThrow(/redirect:/);

    expect(mockPrisma.encounter.create).toHaveBeenCalledTimes(1);
  });
});

describe("startVisit — reuses front-desk queue-state encounters (duplicate-encounter regression)", () => {
  // Replicate Prisma's `status { in }` filter so the production WHERE clause in
  // selectActiveVisitEncounter is exercised end-to-end, not just the mock's
  // canned return. A patient checked-in / roomed by the front desk sits in a
  // queue flow status; Start Visit must reuse that row, not mint a duplicate.
  function withFilteringFindMany(rows: Array<Record<string, unknown>>) {
    mockPrisma.encounter.findMany.mockImplementation(async ({ where }: any) =>
      rows.filter((e: any) => where.status.in.includes(e.status)),
    );
  }

  for (const status of ["checked_in", "ready", "rooming", "roomed", "wrap_up"]) {
    it(`reuses today's ${status} encounter and advances it in-place`, async () => {
      withFilteringFindMany([scheduledEncounter({ id: "live_1", status })]);

      await expect(startVisit("patient_1")).rejects.toThrow(/redirect:/);

      // No duplicate encounter minted...
      expect(mockPrisma.encounter.create).not.toHaveBeenCalled();
      // ...and the existing row (carrying the MA rooming handoff) is advanced
      // into the visit rather than abandoned.
      expect(mockPrisma.encounter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "live_1" },
          data: expect.objectContaining({ status: "in_progress" }),
        }),
      );
    });
  }

  it("mints a fresh encounter when today's only encounter is terminal (complete)", async () => {
    withFilteringFindMany([scheduledEncounter({ id: "done_1", status: "complete" })]);

    await expect(startVisit("patient_1")).rejects.toThrow(/redirect:/);

    expect(mockPrisma.encounter.create).toHaveBeenCalledTimes(1);
  });
});

describe("startVisit — provider attribution", () => {
  it("Dr B starting Dr A's scheduled encounter preserves ownership and stamps rendering provider", async () => {
    // Dr A owns today's scheduled encounter; Dr B (current user) starts the visit.
    const drA = scheduledEncounter({ providerId: "prov_A", renderingProviderId: null });
    mockPrisma.encounter.findMany.mockResolvedValue([drA]);
    mockPrisma.provider.findFirst.mockResolvedValue({ id: "prov_B" });
    // Preserve row fields across the advance update so assignVisitProvider sees provA.
    const row: any = { ...drA };
    mockPrisma.encounter.update.mockImplementation(async ({ where, data }: any) => {
      Object.assign(row, data);
      return { ...row, id: where.id };
    });

    await expect(startVisit("patient_1")).rejects.toThrow(/redirect:/);

    // Rendering provider stamped to Dr B...
    expect(mockPrisma.encounter.update).toHaveBeenCalledWith({
      where: { id: "sched_1" },
      data: { renderingProviderId: "prov_B" },
    });
    // ...and providerId (Dr A) is never reassigned.
    const providerIdWrites = mockPrisma.encounter.update.mock.calls.filter(
      (c) => c[0]?.data && "providerId" in c[0].data,
    );
    expect(providerIdWrites).toHaveLength(0);
  });

  it("claims an unowned reused encounter for the current provider", async () => {
    mockPrisma.encounter.findMany.mockResolvedValue([
      scheduledEncounter({ status: "in_progress", providerId: null }),
    ]);
    mockPrisma.provider.findFirst.mockResolvedValue({ id: "prov_B" });

    await expect(startVisit("patient_1")).rejects.toThrow(/redirect:/);

    expect(mockPrisma.encounter.update).toHaveBeenCalledWith({
      where: { id: "sched_1" },
      data: { providerId: "prov_B" },
    });
  });
});

describe("startVisit — auth parity", () => {
  it("redirects unauthorized (no notes.edit) users away", async () => {
    requireUserMock.mockResolvedValue(clinician({ roles: ["front_office"] }));
    await expect(startVisit("patient_1")).rejects.toThrow(/error=unauthorized/);
    expect(mockPrisma.encounter.create).not.toHaveBeenCalled();
  });

  it("redirects when the chart is restricted and the user is not allowlisted", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(
      patient({ chartRestricted: true, restrictedProviderIds: ["other_doc"] }),
    );
    await expect(startVisit("patient_1")).rejects.toThrow(/error=restricted/);
    expect(mockPrisma.encounter.create).not.toHaveBeenCalled();
  });
});

describe("getVisitReadiness", () => {
  it("returns a rooming/readiness handoff for today's encounter", async () => {
    mockPrisma.encounter.findMany.mockResolvedValue([
      scheduledEncounter({
        briefingContext: { intakeCompleted: true, patientDemeanor: "calm", patientSummary: "x" },
      }),
    ]);

    const result = await getVisitReadiness("patient_1");
    expect(result.hasEncounter).toBe(true);
    expect(result.intakeCompleted).toBe(true);
    expect(result.patientDemeanor).toBe("calm");
  });

  it("reports no encounter when none is active today", async () => {
    mockPrisma.encounter.findMany.mockResolvedValue([]);
    const result = await getVisitReadiness("patient_1");
    expect(result.hasEncounter).toBe(false);
  });
});
