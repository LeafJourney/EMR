import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const now = new Date("2026-06-04T18:30:00.000Z");
  const mockUser = {
    id: "front-desk-1",
    organizationId: "org-1",
    roles: ["front_office"],
  };
  const mockPrisma = {
    encounter: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    now,
    mockUser,
    mockPrisma,
    requireUserMock: vi.fn(async () => mockUser),
    revalidatePathMock: vi.fn((_path: string) => undefined),
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: hoisted.mockPrisma,
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: () => hoisted.requireUserMock(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => hoisted.revalidatePathMock(path),
}));

import { moveQueueEncounter } from "./actions";

describe("ops queue actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(hoisted.now);
    vi.clearAllMocks();

    hoisted.mockPrisma.encounter.findFirst.mockResolvedValue({
      id: "enc-1",
      organizationId: "org-1",
      patientId: "patient-1",
      status: "wrap_up",
      completedAt: null,
    });
    hoisted.mockPrisma.encounter.update.mockResolvedValue({
      id: "enc-1",
      status: "complete",
    });
    hoisted.mockPrisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows front desk to complete a visit from wrap_up", async () => {
    const result = await moveQueueEncounter({
      encounterId: "enc-1",
      target: "complete",
    });

    expect(result).toEqual({ ok: true });
    expect(hoisted.mockPrisma.encounter.findFirst).toHaveBeenCalledWith({
      where: { id: "enc-1", organizationId: "org-1" },
    });
    expect(hoisted.mockPrisma.encounter.update).toHaveBeenCalledWith({
      where: { id: "enc-1" },
      data: {
        status: "complete",
        completedAt: hoisted.now,
      },
    });
    expect(hoisted.mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "front-desk-1",
        action: "encounter.visit_state.updated",
        subjectType: "Encounter",
        subjectId: "enc-1",
        metadata: { from: "wrap_up", to: "complete" },
      }),
    });
    expect(hoisted.revalidatePathMock).toHaveBeenCalledWith("/ops/queue");
  });

  it("rejects users without a queue role before mutating state", async () => {
    hoisted.requireUserMock.mockResolvedValue({
      ...hoisted.mockUser,
      roles: ["clinician"],
    });

    const result = await moveQueueEncounter({
      encounterId: "enc-1",
      target: "complete",
    });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(hoisted.mockPrisma.encounter.update).not.toHaveBeenCalled();
    expect(hoisted.mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});
