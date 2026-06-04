import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Appointment → Encounter bridge. Booking only creates an Appointment; check-in /
 * rooming / the queue board run off Encounters. ensureEncounterForAppointment
 * materializes a scheduled Encounter from a confirmed appointment — idempotently
 * (via the @unique appointmentId), skipping calendar blocks and non-confirmed
 * appointments, and race-safe against concurrent creates.
 */
const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    appointment: { findUnique: vi.fn(), findMany: vi.fn() },
    encounter: { create: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));

import {
  ensureEncounterForAppointment,
  ensureTodayEncounters,
  isCalendarBlockAppointment,
} from "./ensure-encounter";

const { mockPrisma } = hoisted;

const START = new Date("2026-06-04T15:00:00.000Z");

function appt(over: Record<string, unknown> = {}) {
  return {
    id: "appt_1",
    patientId: "patient_1",
    providerId: "prov_1",
    status: "confirmed",
    startAt: START,
    modality: "in_person",
    notes: null,
    encounter: null,
    patient: { organizationId: "org_1", deletedAt: null },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.appointment.findUnique.mockResolvedValue(appt());
  mockPrisma.encounter.create.mockImplementation(async ({ data }: any) => ({ id: "enc_new", ...data }));
  mockPrisma.encounter.findUnique.mockResolvedValue(null);
});

describe("ensureEncounterForAppointment", () => {
  it("creates a scheduled encounter from a confirmed appointment", async () => {
    const enc = await ensureEncounterForAppointment("appt_1");
    expect(mockPrisma.encounter.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.encounter.create.mock.calls[0][0].data).toMatchObject({
      organizationId: "org_1",
      patientId: "patient_1",
      providerId: "prov_1",
      appointmentId: "appt_1",
      status: "scheduled",
      scheduledFor: START,
      modality: "in_person",
    });
    expect(enc?.id).toBe("enc_new");
  });

  it("is idempotent — returns the already-linked encounter without creating", async () => {
    mockPrisma.appointment.findUnique.mockResolvedValue(appt({ encounter: { id: "enc_existing" } }));
    const enc = await ensureEncounterForAppointment("appt_1");
    expect(enc?.id).toBe("enc_existing");
    expect(mockPrisma.encounter.create).not.toHaveBeenCalled();
  });

  it("does NOT materialize a calendar block", async () => {
    mockPrisma.appointment.findUnique.mockResolvedValue(
      appt({ notes: "[CalendarBlock:VACATION] out of office" }),
    );
    const enc = await ensureEncounterForAppointment("appt_1");
    expect(enc).toBeNull();
    expect(mockPrisma.encounter.create).not.toHaveBeenCalled();
  });

  it("does NOT materialize a non-confirmed (requested) appointment", async () => {
    mockPrisma.appointment.findUnique.mockResolvedValue(appt({ status: "requested" }));
    expect(await ensureEncounterForAppointment("appt_1")).toBeNull();
    expect(mockPrisma.encounter.create).not.toHaveBeenCalled();
  });

  it("returns null for a deleted or missing patient/appointment", async () => {
    mockPrisma.appointment.findUnique.mockResolvedValue(
      appt({ patient: { organizationId: "org_1", deletedAt: new Date() } }),
    );
    expect(await ensureEncounterForAppointment("appt_1")).toBeNull();

    mockPrisma.appointment.findUnique.mockResolvedValue(null);
    expect(await ensureEncounterForAppointment("missing")).toBeNull();
    expect(mockPrisma.encounter.create).not.toHaveBeenCalled();
  });

  it("is race-safe — a P2002 on create falls back to the winning row", async () => {
    mockPrisma.encounter.create.mockRejectedValue({ code: "P2002" });
    mockPrisma.encounter.findUnique.mockResolvedValue({ id: "enc_winner" });
    const enc = await ensureEncounterForAppointment("appt_1");
    expect(enc?.id).toBe("enc_winner");
  });
});

describe("ensureTodayEncounters", () => {
  it("materializes today's confirmed, non-block appointments lacking an encounter", async () => {
    mockPrisma.appointment.findMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
    mockPrisma.appointment.findUnique.mockImplementation(async ({ where }: any) => appt({ id: where.id }));

    const created = await ensureTodayEncounters("org_1", new Date("2026-06-04T12:00:00Z"));
    expect(created).toBe(2);
    expect(mockPrisma.encounter.create).toHaveBeenCalledTimes(2);

    const where = mockPrisma.appointment.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("confirmed");
    expect(where.encounter).toEqual({ is: null });
    expect(where.patient).toMatchObject({ organizationId: "org_1", deletedAt: null });
    expect(where.NOT).toEqual({ notes: { startsWith: "[CalendarBlock:" } });
  });

  it("returns 0 (and writes nothing) when there's nothing to materialize", async () => {
    mockPrisma.appointment.findMany.mockResolvedValue([]);
    expect(await ensureTodayEncounters("org_1")).toBe(0);
    expect(mockPrisma.encounter.create).not.toHaveBeenCalled();
  });
});

describe("isCalendarBlockAppointment", () => {
  it("flags only the [CalendarBlock:…] prefix", () => {
    expect(isCalendarBlockAppointment("[CalendarBlock:MEETING] standup")).toBe(true);
    expect(isCalendarBlockAppointment("Follow-up visit")).toBe(false);
    expect(isCalendarBlockAppointment(null)).toBe(false);
    expect(isCalendarBlockAppointment(undefined)).toBe(false);
  });
});
