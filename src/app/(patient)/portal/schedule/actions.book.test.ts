import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Portal booking guardrails (bookAppointment).
 *
 * Regression cover for the hardening sprint: the patient-portal booking action
 * used to create an Appointment unconditionally — no double-booking guard
 * (rescheduleAppointment had one, bookAppointment did not), no future/validity
 * check, and it silently collapsed a "phone" modality into "video". It also
 * returned a bare { id }, so the caller couldn't tell a conflict from success.
 */

const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    patient: { findFirst: vi.fn() },
    provider: { findFirst: vi.fn() },
    appointment: { findFirst: vi.fn(), create: vi.fn() },
  },
  requireUserMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: () => hoisted.requireUserMock(),
}));

import { bookAppointment } from "./actions";

const { mockPrisma, requireUserMock } = hoisted;

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
});
