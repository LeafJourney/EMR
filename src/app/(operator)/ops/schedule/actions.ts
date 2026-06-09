"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { rescheduleToDay } from "@/lib/scheduling/reschedule";

// EMR-1085 (Back-Office Operations Audit §6.1 / §5) — the front desk must be
// able to action a patient-requested booking. These server actions flip a
// `requested` appointment to `confirmed` or `cancelled` (declined) so the
// pre-visit order-of-operations can actually start.

// Scheduling-capable staff. Mirrors the queue actions' role set: front desk,
// MA/biller, office manager, owner/admin, and the system actor.
const SCHEDULE_ROLES = new Set<string>([
  "front_office",
  "back_office",
  "operator",
  "practice_owner",
  "practice_admin",
  "system",
]);

const ApptActionSchema = z.object({ appointmentId: z.string().min(1) });

export type ScheduleActionResult = { ok: true } | { ok: false; error: string };

export async function confirmAppointment(input: {
  appointmentId: string;
}): Promise<ScheduleActionResult> {
  return transition(input, "confirmed");
}

export async function declineAppointment(input: {
  appointmentId: string;
}): Promise<ScheduleActionResult> {
  return transition(input, "cancelled");
}

async function transition(
  input: unknown,
  target: "confirmed" | "cancelled",
): Promise<ScheduleActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Missing organization." };
  if (!user.roles.some((r) => SCHEDULE_ROLES.has(r))) {
    return { ok: false, error: "Forbidden." };
  }

  const parsed = ApptActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  // Org-scope through the patient relation — never action another practice's
  // appointment.
  const appt = await prisma.appointment.findFirst({
    where: {
      id: parsed.data.appointmentId,
      patient: { organizationId: user.organizationId },
    },
    select: { id: true, status: true },
  });
  if (!appt) return { ok: false, error: "Appointment not found." };

  // Idempotent: already in the desired state is a success.
  if (appt.status === target) {
    revalidatePath("/ops/schedule");
    return { ok: true };
  }
  // Only a requested booking can be confirmed/declined from this surface.
  if (appt.status !== "requested") {
    return {
      ok: false,
      error: `Only a requested appointment can be ${
        target === "confirmed" ? "confirmed" : "declined"
      }.`,
    };
  }

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: target },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: target === "confirmed" ? "appointment.confirmed" : "appointment.declined",
      subjectType: "Appointment",
      subjectId: appt.id,
      metadata: { from: "requested", to: target },
    },
  });

  revalidatePath("/ops/schedule");
  return { ok: true };
}

export type RescheduleResult =
  | { ok: true; startAtIso: string }
  | { ok: false; error: string };

/**
 * EMR-921 / EMR-578 — move an appointment to a different calendar day via
 * drag-and-drop on the week board. Keeps the original time-of-day; only the
 * date changes. Date math is server-local to match how the schedule page
 * buckets days (isSameDay on local date parts), so a dropped card re-buckets
 * into the column it was dropped on after the refresh.
 */
export async function rescheduleAppointment(
  appointmentId: string,
  targetDayIso: string,
): Promise<RescheduleResult> {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) return { ok: false, error: "No organization in session." };

  const target = new Date(targetDayIso);
  if (Number.isNaN(target.getTime())) {
    return { ok: false, error: "Invalid target day." };
  }

  // Re-scope to the caller's org — never trust the client id.
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, patient: { organizationId: orgId } },
    select: { id: true, startAt: true, endAt: true, status: true },
  });
  if (!appt) return { ok: false, error: "Appointment not found." };
  if (appt.status === "cancelled" || appt.status === "completed" || appt.status === "no_show") {
    return { ok: false, error: `Can't reschedule a ${appt.status.replace(/_/g, " ")} visit.` };
  }

  // Preserve time-of-day + duration; swap only the calendar date (pure +
  // unit-tested in src/lib/scheduling/reschedule.ts).
  const { start: newStart, end: newEnd, moved } = rescheduleToDay(
    appt.startAt,
    appt.endAt,
    target,
  );
  if (!moved) {
    return { ok: true, startAtIso: appt.startAt.toISOString() };
  }

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { startAt: newStart, endAt: newEnd },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId: user.id,
      action: "appointment.rescheduled",
      subjectType: "Appointment",
      subjectId: appt.id,
      metadata: {
        from: appt.startAt.toISOString(),
        to: newStart.toISOString(),
        channel: "schedule_drag",
      },
    },
  });

  revalidatePath("/ops/schedule");
  return { ok: true, startAtIso: newStart.toISOString() };
}
