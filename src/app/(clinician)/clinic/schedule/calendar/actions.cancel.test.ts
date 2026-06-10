import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// EMR-1110 (FO-M1) — cancelAppointmentAction: role gate, org scoping,
// event emission, audit logging, and already-cancelled idempotency.
//
// vi.mock is hoisted above imports; use vi.hoisted for shared state so the
// mock factories can reach it at hoist-time (same pattern as the billing
// action tests).
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    appointment: {
      findFirst: vi.fn(),
      update: vi.fn(),
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
  const dispatchMock = vi.fn(async () => [] as string[]);
  const cancelEncounterMock = vi.fn(async () => undefined);
  const syncEncounterMock = vi.fn(async () => undefined);

  return {
    mockPrisma,
    mockUser,
    requireUserMock,
    dispatchMock,
    cancelEncounterMock,
    syncEncounterMock,
  };
});

const { mockPrisma, mockUser, dispatchMock, cancelEncounterMock } = hoisted;

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: hoisted.mockPrisma,
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: () => hoisted.requireUserMock(),
}));

vi.mock("@/lib/orchestration/dispatch", () => ({
  dispatch: (...args: unknown[]) => hoisted.dispatchMock(...(args as [])),
}));

vi.mock("@/lib/domain/ensure-encounter", () => ({
  cancelEncounterForAppointment: (...args: unknown[]) =>
    hoisted.cancelEncounterMock(...(args as [])),
  syncEncounterScheduleForAppointment: (...args: unknown[]) =>
    hoisted.syncEncounterMock(...(args as [])),
}));

// Import AFTER the mocks are in place.
import { cancelAppointmentAction } from "./actions";

function resetAll() {
  vi.clearAllMocks();
  mockUser.roles = ["front_office"];
  mockUser.organizationId = "org_1";
  hoisted.requireUserMock.mockImplementation(async () => mockUser);
}

describe("cancelAppointmentAction", () => {
  beforeEach(resetAll);

  it("rejects callers outside the scheduling role allowlist", async () => {
    mockUser.roles = ["patient"];

    const r = await cancelAppointmentAction({ appointmentId: "appt_1" });

    expect(r).toEqual({
      ok: false,
      error: "You don't have permission to cancel appointments.",
    });
    expect(mockPrisma.appointment.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it.each(["front_office", "back_office", "clinician", "practice_owner", "operator"])(
    "allows the %s role through the gate",
    async (role) => {
      mockUser.roles = [role];
      mockPrisma.appointment.findFirst.mockResolvedValue({
        id: "appt_1",
        status: "confirmed",
      });
      mockPrisma.appointment.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const r = await cancelAppointmentAction({ appointmentId: "appt_1" });

      expect(r).toEqual({ ok: true });
    },
  );

  it("scopes the lookup to the caller's org and fails closed when missing", async () => {
    mockPrisma.appointment.findFirst.mockResolvedValue(null);

    const r = await cancelAppointmentAction({ appointmentId: "appt_foreign" });

    expect(r).toEqual({ ok: false, error: "Appointment not found." });
    expect(mockPrisma.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "appt_foreign",
          patient: { organizationId: "org_1" },
        }),
      }),
    );
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
  });

  it("cancels: sets status, emits appointment.cancelled, audit-logs the reason", async () => {
    mockPrisma.appointment.findFirst.mockResolvedValue({
      id: "appt_1",
      status: "confirmed",
    });
    mockPrisma.appointment.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const r = await cancelAppointmentAction({
      appointmentId: "appt_1",
      reason: "Patient requested",
    });

    expect(r).toEqual({ ok: true });
    expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: { status: "cancelled" },
    });
    expect(cancelEncounterMock).toHaveBeenCalledWith("appt_1");
    expect(dispatchMock).toHaveBeenCalledWith({
      name: "appointment.cancelled",
      appointmentId: "appt_1",
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org_1",
        actorUserId: "user_1",
        action: "appointment.cancelled",
        subjectType: "Appointment",
        subjectId: "appt_1",
        metadata: expect.objectContaining({
          previousStatus: "confirmed",
          reason: "Patient requested",
        }),
      }),
    });
  });

  it("is idempotent: an already-cancelled appointment is an ok no-op", async () => {
    mockPrisma.appointment.findFirst.mockResolvedValue({
      id: "appt_1",
      status: "cancelled",
    });

    const r = await cancelAppointmentAction({ appointmentId: "appt_1" });

    expect(r).toEqual({ ok: true });
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(cancelEncounterMock).not.toHaveBeenCalled();
  });
});
