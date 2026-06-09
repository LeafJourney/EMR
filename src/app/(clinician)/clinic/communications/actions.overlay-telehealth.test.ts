import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * startOverlayTelehealthVisit must reuse an existing non-terminal video
 * encounter (including one the front desk already checked in / roomed) before
 * minting a new one. The old query filtered status IN (scheduled, in_progress),
 * which duplicated the encounter when a patient pivoted to telehealth mid-flow.
 */
const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    patient: { findFirst: vi.fn() },
    encounter: { findFirst: vi.fn(), create: vi.fn() },
  },
  requireUserMock: vi.fn(),
  startTelehealthMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));
vi.mock("../patients/[id]/telehealth/actions", () => ({
  startTelehealthVisit: (...args: unknown[]) => hoisted.startTelehealthMock(...args),
  endTelehealthVisit: vi.fn(),
}));

import { startOverlayTelehealthVisit } from "./actions";
import { ACTIVE_VISIT_STATUSES } from "@/lib/domain/visit-state";

const { mockPrisma, requireUserMock, startTelehealthMock } = hoisted;

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({
    id: "u1",
    firstName: "Cli",
    lastName: "Nician",
    roles: ["clinician"],
    organizationId: "org_1",
  });
  mockPrisma.patient.findFirst.mockResolvedValue({
    id: "patient_1",
    firstName: "Pat",
    lastName: "Ient",
    presentingConcerns: null,
    medications: [],
  });
  mockPrisma.encounter.findFirst.mockResolvedValue(null);
  mockPrisma.encounter.create.mockResolvedValue({ id: "new_video_enc" });
  startTelehealthMock.mockResolvedValue({ roomUrl: "https://room" });
});

describe("startOverlayTelehealthVisit", () => {
  it("queries for any non-terminal video encounter (not just scheduled/in_progress)", async () => {
    await startOverlayTelehealthVisit();
    const where = mockPrisma.encounter.findFirst.mock.calls[0][0].where;
    expect(where.modality).toBe("video");
    expect(new Set(where.status.in)).toEqual(new Set(ACTIVE_VISIT_STATUSES));
  });

  it("reuses a roomed video encounter instead of creating a duplicate", async () => {
    mockPrisma.encounter.findFirst.mockResolvedValue({ id: "roomed_video", status: "roomed" });
    const r = await startOverlayTelehealthVisit();
    expect(r.encounterId).toBe("roomed_video");
    expect(mockPrisma.encounter.create).not.toHaveBeenCalled();
  });

  it("creates a video encounter when none is active", async () => {
    const r = await startOverlayTelehealthVisit();
    expect(r.encounterId).toBe("new_video_enc");
    expect(mockPrisma.encounter.create).toHaveBeenCalledTimes(1);
  });
});
