import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Voice charting must reuse today's active encounter, not mint a duplicate.
 * startVoiceEncounter used to match status="in_progress" only, so a patient the
 * front desk had checked in or roomed (checked_in/rooming/roomed) was missed and
 * voice charting spun up a SECOND encounter — orphaning the rooming handoff. It
 * now goes through selectActiveVisitEncounter (all non-terminal statuses).
 */
const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    patient: { findFirst: vi.fn() },
    encounter: { findMany: vi.fn(), create: vi.fn() },
  },
  requireUserMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));
vi.mock("@/lib/orchestration/model-client", () => ({
  resolveModelClient: vi.fn(),
  isModelError: vi.fn(() => false),
}));
vi.mock("@/lib/observability/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { startVoiceEncounter } from "./actions";

const { mockPrisma, requireUserMock } = hoisted;

// Replicate Prisma's status `in` filter so selectActiveVisitEncounter's real
// WHERE clause is exercised end-to-end.
function withFilteringFindMany(rows: Array<Record<string, unknown>>) {
  mockPrisma.encounter.findMany.mockImplementation(async ({ where }: any) =>
    rows.filter((e: any) => where.status.in.includes(e.status)),
  );
}

function enc(over: Record<string, unknown> = {}) {
  return {
    id: "live",
    organizationId: "org_1",
    patientId: "patient_1",
    scheduledFor: new Date(),
    createdAt: new Date(),
    startedAt: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "u1", organizationId: "org_1" });
  mockPrisma.patient.findFirst.mockResolvedValue({ id: "patient_1", organizationId: "org_1" });
  mockPrisma.encounter.findMany.mockResolvedValue([]);
  mockPrisma.encounter.create.mockResolvedValue({ id: "new_voice_enc" });
});

describe("startVoiceEncounter", () => {
  it.each(["checked_in", "rooming", "roomed", "scheduled", "in_progress"])(
    "reuses today's %s encounter instead of creating a duplicate",
    async (status) => {
      withFilteringFindMany([enc({ status })]);
      const r = await startVoiceEncounter("patient_1");
      expect(r.encounterId).toBe("live");
      expect(mockPrisma.encounter.create).not.toHaveBeenCalled();
    },
  );

  it("creates a new encounter only when none is active today (terminal-only)", async () => {
    withFilteringFindMany([enc({ id: "done", status: "complete" })]);
    const r = await startVoiceEncounter("patient_1");
    expect(r.encounterId).toBe("new_voice_enc");
    expect(mockPrisma.encounter.create).toHaveBeenCalledTimes(1);
  });

  it("throws when the patient is not found / not in the user's org", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(null);
    await expect(startVoiceEncounter("patient_x")).rejects.toThrow(/not found/i);
    expect(mockPrisma.encounter.create).not.toHaveBeenCalled();
  });
});
