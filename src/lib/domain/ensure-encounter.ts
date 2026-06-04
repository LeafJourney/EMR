import { prisma } from "@/lib/db/prisma";
import type { Encounter } from "@prisma/client";

/**
 * ensure-encounter — bridge confirmed Appointments into Encounters.
 *
 * Booking creates only an Appointment; the check-in → rooming → visit spine runs
 * off Encounters. Without a bridge, a booked patient has no Encounter, so kiosk
 * check-in reports "no appointment" and the queue board never shows them. These
 * helpers materialize a `scheduled` Encounter from a confirmed Appointment,
 * linked via the @unique `appointmentId` (which makes the create race-safe).
 *
 * NOT materialized: calendar blocks (vacation / meeting / do_not_book — created
 * by createSpecialBlockAction with a "[CalendarBlock:…]" notes prefix on the
 * System/CalendarBlock placeholder patient) and any non-confirmed appointment.
 */

/** Vacation / meeting / do-not-book holds are confirmed appointments but never visits. */
export function isCalendarBlockAppointment(notes: string | null | undefined): boolean {
  return typeof notes === "string" && notes.startsWith("[CalendarBlock:");
}

function isUniqueConstraintError(err: unknown): boolean {
  const code =
    typeof err === "object" && err !== null && "code" in err ? (err as { code?: unknown }).code : null;
  return code === "P2002";
}

function dayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Idempotently materialize the Encounter for one Appointment.
 *  - Returns the already-linked Encounter if present (the @unique appointmentId
 *    guarantees at most one), so this is safe to call repeatedly.
 *  - Creates a `scheduled` Encounter (copying scheduledFor / providerId /
 *    modality) only for a `confirmed`, non-calendar-block, live-patient appointment.
 *  - Returns null when there's nothing to (or we shouldn't) materialize.
 *  - Race-safe: a concurrent create that loses the @unique(appointmentId) race
 *    (P2002) falls back to re-reading the winning row.
 */
export async function ensureEncounterForAppointment(
  appointmentId: string,
): Promise<Encounter | null> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      encounter: true,
      patient: { select: { organizationId: true, deletedAt: true } },
    },
  });
  if (!appt || !appt.patient || appt.patient.deletedAt) return null;

  // Already materialized — idempotent no-op.
  if (appt.encounter) return appt.encounter;

  // Only confirmed real-patient visits get an encounter.
  if (appt.status !== "confirmed") return null;
  if (isCalendarBlockAppointment(appt.notes)) return null;

  try {
    return await prisma.encounter.create({
      data: {
        organizationId: appt.patient.organizationId,
        patientId: appt.patientId,
        providerId: appt.providerId ?? undefined,
        appointmentId: appt.id,
        status: "scheduled",
        scheduledFor: appt.startAt,
        modality: appt.modality,
        reason: appt.notes ?? undefined,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      // A concurrent caller won the appointmentId race — return their row.
      return prisma.encounter.findUnique({ where: { appointmentId: appt.id } });
    }
    throw err;
  }
}

/**
 * Day-of backstop: materialize encounters for every confirmed, non-block
 * appointment scheduled today (in `organizationId`) that doesn't already have
 * one, so booked patients appear on the queue board as "Scheduled" before they
 * arrive. Idempotent — after the first run the `encounter is null` filter
 * returns nothing, so repeat calls (the board polls every 30s) are cheap.
 * Returns the number of encounters created.
 */
export async function ensureTodayEncounters(
  organizationId: string,
  now: Date = new Date(),
): Promise<number> {
  const { start, end } = dayBounds(now);

  const appts = await prisma.appointment.findMany({
    where: {
      status: "confirmed",
      startAt: { gte: start, lte: end },
      encounter: { is: null },
      patient: { organizationId, deletedAt: null },
      NOT: { notes: { startsWith: "[CalendarBlock:" } },
    },
    select: { id: true },
  });

  let created = 0;
  for (const appt of appts) {
    const enc = await ensureEncounterForAppointment(appt.id);
    if (enc) created += 1;
  }
  return created;
}

/**
 * Kiosk self-sufficiency: ensure THIS patient's confirmed appointment for today
 * has its Encounter before the kiosk looks it up, so a booked patient can check
 * in even if no one has opened the queue board yet. Returns the (existing or new)
 * encounter, or null if there's no eligible appointment.
 */
export async function ensureTodayEncounterForPatient(
  organizationId: string,
  patientId: string,
  now: Date = new Date(),
): Promise<Encounter | null> {
  const { start, end } = dayBounds(now);

  const appt = await prisma.appointment.findFirst({
    where: {
      patientId,
      status: "confirmed",
      startAt: { gte: start, lte: end },
      encounter: { is: null },
      NOT: { notes: { startsWith: "[CalendarBlock:" } },
      patient: { organizationId, deletedAt: null },
    },
    select: { id: true },
    orderBy: { startAt: "asc" },
  });
  if (!appt) return null;
  return ensureEncounterForAppointment(appt.id);
}

/**
 * Keep a materialized Encounter's scheduledFor in step with its Appointment when
 * the appointment is moved. Only touches an encounter still in `scheduled`
 * (untouched) state — never a checked-in / roomed / started visit. Idempotent.
 */
export async function syncEncounterScheduleForAppointment(
  appointmentId: string,
  newStartAt: Date,
): Promise<void> {
  await prisma.encounter.updateMany({
    where: { appointmentId, status: "scheduled" },
    data: { scheduledFor: newStartAt },
  });
}

/**
 * Cancel the Encounter materialized for an Appointment when that appointment is
 * cancelled, so it doesn't linger as a ghost "Scheduled" card on the queue board
 * (and isn't reused by selectActiveVisitEncounter). Only cancels an encounter
 * still in `scheduled` state — a patient who already checked in, or a started
 * visit, is left for staff to resolve on the queue. Idempotent.
 */
export async function cancelEncounterForAppointment(
  appointmentId: string,
  now: Date = new Date(),
): Promise<void> {
  await prisma.encounter.updateMany({
    where: { appointmentId, status: "scheduled" },
    data: { status: "cancelled", cancelledAt: now },
  });
}
