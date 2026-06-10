import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WS-B Task 2 (audit minor #8) — generateLeafletForNote backs the in-flow
 * "Patient leaflet" preview in the visit-completion panel. It resolves a note's
 * encounter (org-scoped) and assembles + narrates the leaflet. With an empty
 * note the narrative takes the deterministic path, so no model mock is needed.
 */
const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    note: { findFirst: vi.fn() },
    encounter: { findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
    patientMedication: { findMany: vi.fn() },
    dosingRegimen: { findMany: vi.fn() },
    outcomeLog: { findMany: vi.fn() },
    appointment: { findMany: vi.fn() },
    provider: { findUnique: vi.fn() },
  },
  requireUserMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));
vi.mock("@/lib/orchestration/context", () => ({ createLightContext: vi.fn() }));

import { generateLeafletForNote } from "./actions";

const { mockPrisma, requireUserMock } = hoisted;

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "user_1", organizationId: "org_1" });
  mockPrisma.note.findFirst.mockResolvedValue({ encounterId: "enc_1" });
  mockPrisma.encounter.findFirst.mockResolvedValue({
    id: "enc_1",
    organizationId: "org_1",
    providerId: null,
    modality: "in_person",
    reason: "Follow-up",
    scheduledFor: new Date("2026-06-09T15:00:00.000Z"),
    createdAt: new Date("2026-06-09T15:00:00.000Z"),
    patient: {
      id: "patient_1",
      firstName: "Mia",
      lastName: "Lopez",
      dateOfBirth: null,
      allergies: [],
    },
    notes: [], // empty → narrativeSource is "" → deterministic narrative
  });
  mockPrisma.organization.findUnique.mockResolvedValue({ timeZone: null });
  mockPrisma.patientMedication.findMany.mockResolvedValue([]);
  mockPrisma.dosingRegimen.findMany.mockResolvedValue([]);
  mockPrisma.outcomeLog.findMany.mockResolvedValue([]);
  mockPrisma.appointment.findMany.mockResolvedValue([]);
  mockPrisma.provider.findUnique.mockResolvedValue(null);
});

describe("generateLeafletForNote", () => {
  it("resolves the note's encounter and returns a narrative + leaflet data", async () => {
    const result = await generateLeafletForNote("note_1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.patientName).toBe("Mia Lopez");
    expect(result.narrative.length).toBeGreaterThan(0);
    // The note lookup is org-scoped via the encounter relation.
    expect(mockPrisma.note.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "note_1", encounter: { organizationId: "org_1" } },
        select: { encounterId: true },
      }),
    );
  });

  it("returns an error when the note is not in the caller's org", async () => {
    mockPrisma.note.findFirst.mockResolvedValue(null);
    const result = await generateLeafletForNote("note_1");
    expect(result).toEqual({ ok: false, error: "Note not found" });
    expect(mockPrisma.encounter.findFirst).not.toHaveBeenCalled();
  });
});
