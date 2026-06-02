// EMR-914 — clinician-facing "upcoming visits with missing info".
//
// Reads the CANONICAL readiness SoT (getAppointmentReadiness) for each upcoming
// org appointment and surfaces the ones still missing blocking intake items, so
// front-desk / clinicians can chase them before the visit. Composition lives
// here (not in the PHI-free SoT module) because it joins readiness with patient
// NAMES for a staff surface.

import { prisma } from "@/lib/db/prisma";
import {
  getAppointmentReadiness,
  type PrevisitReadiness,
  type MissingRequirement,
} from "@/lib/scheduling/previsit-readiness";

const DAY_MS = 24 * 60 * 60_000;
const LOOKAHEAD_DAYS = 7;
/** Bound the per-appointment readiness fan-out + the rendered list. */
const MAX_APPOINTMENTS_SCANNED = 60;
const MAX_ROWS = 8;

export interface UpcomingMissingRow {
  appointmentId: string;
  patientId: string;
  firstName: string;
  lastName: string;
  /** "today" / "tomorrow" / "in N days". */
  whenLabel: string;
  /** Labels of the missing blocking requirements (from the gate). */
  missingLabels: string[];
  outstandingCount: number;
  /** 0..100, for a compact readiness chip. */
  completionPct: number;
}

export interface UpcomingReadinessItem {
  appointmentId: string;
  patientId: string;
  firstName: string;
  lastName: string;
  startAt: Date;
  readiness: PrevisitReadiness;
  missingRequirements: MissingRequirement[];
}

/** Countdown copy by UTC calendar day; today/past clamp to "today". */
export function whenLabel(startAt: Date, now: Date): string {
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const b = Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate());
  const days = Math.round((b - a) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * Pure shaping: keep only not-ready appointments with outstanding items, soonest
 * first, capped. Separated from the DB/readiness fan-out so it's unit-testable.
 */
export function buildUpcomingMissingRows(
  items: UpcomingReadinessItem[],
  now: Date,
  limit: number = MAX_ROWS,
): UpcomingMissingRow[] {
  return items
    .filter((it) => !it.readiness.isReady && it.missingRequirements.length > 0)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .slice(0, limit)
    .map((it) => ({
      appointmentId: it.appointmentId,
      patientId: it.patientId,
      firstName: it.firstName,
      lastName: it.lastName,
      whenLabel: whenLabel(it.startAt, now),
      missingLabels: it.missingRequirements.map((m) => m.label),
      outstandingCount: it.readiness.outstandingRequiredCount,
      completionPct: Math.round(it.readiness.completionPct * 100),
    }));
}

/**
 * Load the org's upcoming appointments (next 7 days, still open) and resolve
 * readiness for each in parallel, returning the ones with missing blocking
 * items. Org-scoped via patient.organizationId (Appointment has no org column).
 */
export async function loadUpcomingVisitsMissingInfo(
  organizationId: string,
  now: Date,
): Promise<UpcomingMissingRow[]> {
  const windowEnd = new Date(now.getTime() + LOOKAHEAD_DAYS * DAY_MS);

  const appts = await prisma.appointment.findMany({
    where: {
      patient: { organizationId },
      status: { in: ["requested", "confirmed"] },
      startAt: { gt: now, lte: windowEnd },
    },
    orderBy: { startAt: "asc" },
    take: MAX_APPOINTMENTS_SCANNED,
    select: {
      id: true,
      startAt: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const evaluated = await Promise.all(
    appts.map(async (a): Promise<UpcomingReadinessItem | null> => {
      const r = await getAppointmentReadiness(a.id, now);
      if (!r) return null;
      return {
        appointmentId: a.id,
        patientId: a.patient.id,
        firstName: a.patient.firstName,
        lastName: a.patient.lastName,
        startAt: a.startAt,
        readiness: r.readiness,
        missingRequirements: r.missingRequirements,
      };
    }),
  );

  return buildUpcomingMissingRows(
    evaluated.filter((x): x is UpcomingReadinessItem => x !== null),
    now,
  );
}
