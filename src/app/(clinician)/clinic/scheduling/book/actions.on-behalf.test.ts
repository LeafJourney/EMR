import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// EMR-1110 (FO-M2) — confirmBookingAction on-behalf path: staff with an
// explicit patientId book for that (org-scoped) patient; non-staff are
// rejected; the self-serve userId fallback is unchanged for patient users.
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    patient: {
      findFirst: vi.fn(),
    },
    appointment: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  const mockUser = {
    id: "user_1",
    email: "frontdesk@example.com",
    firstName: "Robin",
    lastName: "Vance",
    roles: ["front_office"] as string[],
    organizationId: "org_1" as string | null,
    organizationName: "Leaf Clinic",
  };

  const requireUserMock = vi.fn(async () => mockUser);

  return { mockPrisma, mockUser, requireUserMock };
});

const { mockPrisma, mockUser } = hoisted;

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: hoisted.mockPrisma,
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: () => hoisted.requireUserMock(),
}));

// Import AFTER the mocks are in place.
import { confirmBookingAction, type ConfirmBookingInput } from "./actions";

const baseInput = (overrides: Partial<ConfirmBookingInput> = {}): ConfirmBookingInput => ({
  visitTypeId: "follow_up",
  durationMinutes: 20,
  modality: "video",
  providerId: null,
  slotStartIso: "2026-06-15T17:00:00.000Z",
  insurance: { selfPay: true },
  ...overrides,
});

function resetAll() {
  vi.clearAllMocks();
  mockUser.roles = ["front_office"];
  mockUser.organizationId = "org_1";
  hoisted.requireUserMock.mockImplementation(async () => mockUser);
  mockPrisma.appointment.create.mockResolvedValue({ id: "appt_new" });
  mockPrisma.auditLog.create.mockResolvedValue({});
}

describe("confirmBookingAction — on-behalf booking", () => {
  beforeEach(resetAll);

  it("staff with an explicit patientId book for that patient (org-scoped)", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue({
      id: "pat_2",
      firstName: "Ada",
      lastName: "Lopez",
    });

    const r = await confirmBookingAction(baseInput({ patientId: "pat_2" }));

    expect(r.ok).toBe(true);
    // Lookup must be by explicit id within the caller's org — NOT userId.
    expect(mockPrisma.patient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "pat_2",
          organizationId: "org_1",
          deletedAt: null,
        }),
      }),
    );
    expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ patientId: "pat_2" }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "appointment.created",
          subjectId: "appt_new",
          metadata: expect.objectContaining({ onBehalf: true, patientId: "pat_2" }),
        }),
      }),
    );
  });

  it("rejects a non-staff caller passing patientId", async () => {
    mockUser.roles = ["patient"];

    const r = await confirmBookingAction(baseInput({ patientId: "pat_2" }));

    expect(r).toEqual({
      ok: false,
      error: "You don't have permission to book for another patient.",
    });
    expect(mockPrisma.patient.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
  });

  it("rejects when the explicit patient isn't in the caller's org", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(null);

    const r = await confirmBookingAction(baseInput({ patientId: "pat_foreign" }));

    expect(r).toEqual({ ok: false, error: "Patient not found in your organization." });
    expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
  });

  it("self-serve fallback unchanged: a patient user books their own record", async () => {
    mockUser.roles = ["patient"];
    mockPrisma.patient.findFirst.mockResolvedValue({
      id: "pat_self",
      firstName: "Sam",
      lastName: "Reyes",
    });

    const r = await confirmBookingAction(baseInput());

    expect(r.ok).toBe(true);
    expect(mockPrisma.patient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org_1", userId: "user_1" }),
      }),
    );
    expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ patientId: "pat_self" }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ onBehalf: false }),
        }),
      }),
    );
  });

  it("tells staff without a patient selection to pick one", async () => {
    // Staff user has no patient record of their own.
    mockPrisma.patient.findFirst.mockResolvedValue(null);

    const r = await confirmBookingAction(baseInput());

    expect(r).toEqual({
      ok: false,
      error: "Select a patient to book for — staff bookings need an explicit patient.",
    });
    expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
  });
});
