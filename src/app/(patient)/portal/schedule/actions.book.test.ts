import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Portal booking guardrails (bookAppointment) + lifecycle emissions
 * (EMR-1115 / PJ-B4).
 *
 * Regression cover for the hardening sprint: the patient-portal booking action
 * used to create an Appointment unconditionally — no double-booking guard
 * (rescheduleAppointment had one, bookAppointment did not), no future/validity
 * check, and it silently collapsed a "phone" modality into "video". It also
 * returned a bare { id }, so the caller couldn't tell a conflict from success.
 *
 * EMR-1115 adds: bookAppointment dispatches a typed `appointment.created`
 * event + audit row, and cancelAppointment dispatches `appointment.cancelled`
 * + audit row (mirroring the clinic-side cancel action).
 */

const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    patient: { findFirst: vi.fn() },
    provider: { findFirst: vi.fn() },
    appointment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  requireUserMock: vi.fn(),
  dispatchMock: vi.fn(async () => [] as string[]),
  cancelEncounterMock: vi.fn(async () => undefined),
  syncEncounterMock: vi.fn(async () => undefined),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
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

import { bookAppointment, cancelAppointment } from "./actions";

const { mockPrisma, requireUserMock, dispatchMock, cancelEncounterMock } = hoisted;

const FUTURE = "2099-03-01";
const TIME = "09:00";

function base(over: Record<string, unknown> = {}) {
  return {
    patientId: "patient_1",
    providerId: "prov_1",
    slotDate: FUTURE,
    slotStartTime: TIME,
    appointmentType: "follow_up",
    modality: "in_person",
    ...over,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "user_1" });
  mockPrisma.patient.findFirst.mockResolvedValue({ id: "patient_1", organizationId: "org_1" });
  mockPrisma.provider.findFirst.mockResolvedValue({ id: "prov_1" });
  mockPrisma.appointment.findFirst.mockResolvedValue(null);
  mockPrisma.appointment.create.mockResolvedValue({ id: "appt_new" });
  mockPrisma.appointment.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
});

describe("bookAppointment", () => {
  it("books a free slot and returns the new id", async () => {
    const res = await bookAppointment(base());
    expect(res).toEqual({ ok: true, id: "appt_new" });
    expect(mockPrisma.appointment.create).toHaveBeenCalledTimes(1);
  });

  it("refuses to double-book an overlapping provider slot", async () => {
    mockPrisma.appointment.findFirst.mockResolvedValue({ id: "existing" });
    const res = await bookAppointment(base());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("CONFLICT");
    expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
  });

  it("checks for conflicts on the overlap window (lt end / gt start)", async () => {
    await bookAppointment(base());
    const where = mockPrisma.appointment.findFirst.mock.calls[0][0].where;
    expect(where.providerId).toBe("prov_1");
    expect(where.status.in).toEqual(["requested", "confirmed"]);
    expect(where.startAt.lt).toBeInstanceOf(Date);
    expect(where.endAt.gt).toBeInstanceOf(Date);
  });

  it("rejects an unknown / inactive / cross-org provider without booking", async () => {
    mockPrisma.provider.findFirst.mockResolvedValue(null);
    const res = await bookAppointment(base());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/provider/i);
    expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
  });

  it("scopes the provider lookup to the patient's org and active providers", async () => {
    await bookAppointment(base());
    const where = mockPrisma.provider.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe("prov_1");
    expect(where.organizationId).toBe("org_1");
    expect(where.active).toBe(true);
  });

  it("rejects a time in the past without touching the DB", async () => {
    const res = await bookAppointment(base({ slotDate: "2020-01-01" }));
    expect(res.ok).toBe(false);
    expect(mockPrisma.appointment.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
  });

  it("rejects an unparseable time", async () => {
    const res = await bookAppointment(base({ slotDate: "not-a-date" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/invalid/i);
    expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
  });

  it("preserves the phone modality instead of collapsing it to video", async () => {
    await bookAppointment(base({ modality: "phone" }));
    expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ modality: "phone" }),
      }),
    );
  });

  it("rejects booking for a patient the user does not own", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(null);
    await expect(bookAppointment(base())).rejects.toThrow(/unauthorized|not found/i);
    expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
  });

  // ── EMR-1115 (PJ-B4) — lifecycle emission ─────────────────────────

  it("dispatches a typed appointment.created event (source: patient) and audit-logs it", async () => {
    const res = await bookAppointment(base({ modality: "video" }));
    expect(res.ok).toBe(true);

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "appointment.created",
        appointmentId: "appt_new",
        patientId: "patient_1",
        organizationId: "org_1",
        modality: "video",
        source: "patient",
      }),
    );
    expect((dispatchMock.mock.calls[0] as any[])[0].startAt).toBeInstanceOf(Date);

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org_1",
        actorUserId: "user_1",
        action: "appointment.created",
        subjectType: "Appointment",
        subjectId: "appt_new",
        metadata: expect.objectContaining({ source: "patient", modality: "video" }),
      }),
    });
  });

  it("does not emit or audit when the booking is rejected", async () => {
    mockPrisma.appointment.findFirst.mockResolvedValue({ id: "existing" });
    await bookAppointment(base());
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("cancelAppointment (patient-side)", () => {
  const futureAppt = () => ({
    id: "appt_1",
    status: "confirmed",
    startAt: new Date("2099-03-01T17:00:00Z"),
    patient: { id: "patient_1", organizationId: "org_1" },
  });

  it("cancels, releases the encounter, emits appointment.cancelled, and audit-logs", async () => {
    mockPrisma.appointment.findFirst.mockResolvedValue(futureAppt());

    const res = await cancelAppointment({ appointmentId: "appt_1" });

    expect(res).toEqual({ ok: true });
    expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: { status: "cancelled" },
    });
    expect(cancelEncounterMock).toHaveBeenCalledWith("appt_1");
    expect(dispatchMock).toHaveBeenCalledWith({
      name: "appointment.cancelled",
      appointmentId: "appt_1",
      patientId: "patient_1",
      organizationId: "org_1",
      reason: null,
      source: "patient",
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
          source: "patient",
        }),
      }),
    });
  });

  it("scopes the lookup to the caller's own patient record", async () => {
    mockPrisma.appointment.findFirst.mockResolvedValue(null);
    const res = await cancelAppointment({ appointmentId: "appt_foreign" });
    expect(res).toEqual({ ok: false, error: "Appointment not found." });
    expect(mockPrisma.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "appt_foreign",
          patient: { userId: "user_1", deletedAt: null },
        }),
      }),
    );
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("rejects already-cancelled appointments without emitting", async () => {
    mockPrisma.appointment.findFirst.mockResolvedValue({
      ...futureAppt(),
      status: "cancelled",
    });
    const res = await cancelAppointment({ appointmentId: "appt_1" });
    expect(res.ok).toBe(false);
    expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects past appointments without emitting", async () => {
    mockPrisma.appointment.findFirst.mockResolvedValue({
      ...futureAppt(),
      startAt: new Date("2020-01-01T17:00:00Z"),
    });
    const res = await cancelAppointment({ appointmentId: "appt_1" });
    expect(res.ok).toBe(false);
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
