"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { rescheduleToDay } from "@/lib/scheduling/reschedule";

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
