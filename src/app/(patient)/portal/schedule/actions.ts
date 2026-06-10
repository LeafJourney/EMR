"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  cancelEncounterForAppointment,
  syncEncounterScheduleForAppointment,
} from "@/lib/domain/ensure-encounter";
import type { AppointmentType } from "@/lib/domain/scheduling";
import { dispatch } from "@/lib/orchestration/dispatch";
import { zonedTimeToUtc, DEFAULT_TIME_ZONE } from "@/lib/utils/timezone";

interface BookAppointmentInput {
  patientId: string;
  providerId: string;
  slotDate: string;
  slotStartTime: string;
  appointmentType: AppointmentType;
  modality: "in_person" | "video" | "phone";
  reason?: string;
}

function durationMinutesFor(t: AppointmentType): number {
  return t === "new_patient" ? 60 : t === "urgent" ? 15 : 30;
}

const BOOK_MODALITIES = new Set(["in_person", "video", "phone"]);

export type BookAppointmentResult =
  | { ok: true; id: string }
  | { ok: false; error: string; code?: string };

async function getOwnedPatient(userId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, userId, deletedAt: null },
    include: { organization: { select: { timeZone: true } } },
  });
  if (!patient) throw new Error("Patient not found or unauthorized.");
  return patient;
}

export async function bookAppointment(
  input: BookAppointmentInput,
): Promise<BookAppointmentResult> {
  const user = await requireUser();
  const patient = await getOwnedPatient(user.id, input.patientId);

  // Interpret the chosen slot in the CLINIC's timezone, then store the correct
  // UTC instant. Previously `new Date("...T11:00:00")` was parsed in the
  // server's timezone (UTC in prod), so an 11:00 AM booking was stored as
  // 11:00 UTC and shown back to the patient as 4:00 AM.
  const timeZone = patient.organization?.timeZone || DEFAULT_TIME_ZONE;
  const [bYear, bMonth, bDay] = input.slotDate.split("-").map(Number);
  const [bHour, bMinute] = input.slotStartTime.split(":").map(Number);
  if ([bYear, bMonth, bDay, bHour, bMinute].some((n) => Number.isNaN(n))) {
    return { ok: false, error: "Invalid appointment time." };
  }
  const startAt = zonedTimeToUtc(timeZone, {
    year: bYear,
    month: bMonth,
    day: bDay,
    hour: bHour,
    minute: bMinute,
  });
  if (startAt.getTime() < Date.now()) {
    return { ok: false, error: "Choose a time in the future." };
  }

  const endAt = new Date(
    startAt.getTime() + durationMinutesFor(input.appointmentType) * 60_000,
  );

  // The provider must exist, be active, and belong to the patient's org —
  // bookAppointment previously trusted an arbitrary providerId, so the portal
  // could create a dangling appointment against a missing or cross-org provider.
  const provider = await prisma.provider.findFirst({
    where: {
      id: input.providerId,
      organizationId: patient.organizationId,
      active: true,
    },
    select: { id: true },
  });
  if (!provider) {
    return { ok: false, error: "That provider isn't available for booking." };
  }

  // Don't let the portal double-book a provider's slot. rescheduleAppointment
  // already enforces this guard; bookAppointment skipped it, so two patients
  // (or one patient clicking twice) could create overlapping "requested"
  // appointments on the same provider.
  const conflict = await prisma.appointment.findFirst({
    where: {
      providerId: provider.id,
      status: { in: ["requested", "confirmed"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  if (conflict) {
    return {
      ok: false,
      error: "That time was just taken. Please pick another slot.",
      code: "CONFLICT",
    };
  }

  // Preserve the requested modality (in_person | video | phone). The old code
  // silently collapsed "phone" into "video".
  const modality = BOOK_MODALITIES.has(input.modality) ? input.modality : "video";

  const appointment = await prisma.appointment.create({
    data: {
      patientId: input.patientId,
      providerId: input.providerId,
      status: "requested",
      startAt,
      endAt,
      modality,
      notes: input.reason ?? null,
    },
  });

  // EMR-1115 (PJ-B4) — the success screen promises "a confirmation message
  // shortly"; this event is what makes that true. The appointment-lifecycle
  // workflow turns it into a portal Notification + care-team Message.
  await dispatch({
    name: "appointment.created",
    appointmentId: appointment.id,
    patientId: patient.id,
    organizationId: patient.organizationId,
    startAt,
    modality,
    source: "patient",
  });

  await prisma.auditLog.create({
    data: {
      organizationId: patient.organizationId,
      actorUserId: user.id,
      action: "appointment.created",
      subjectType: "Appointment",
      subjectId: appointment.id,
      metadata: {
        source: "patient",
        modality,
        startAt: startAt.toISOString(),
      },
    },
  });

  revalidatePath("/portal/schedule");
  return { ok: true, id: appointment.id };
}

const cancelSchema = z.object({ appointmentId: z.string().min(1) });

export async function cancelAppointment(
  payload: z.infer<typeof cancelSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = cancelSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const appt = await prisma.appointment.findFirst({
    where: {
      id: parsed.data.appointmentId,
      patient: { userId: user.id, deletedAt: null },
    },
    include: {
      patient: { select: { id: true, organizationId: true } },
    },
  });
  if (!appt) return { ok: false, error: "Appointment not found." };

  // Only future, non-completed appointments may be cancelled by the patient.
  if (appt.status === "cancelled" || appt.status === "completed") {
    return { ok: false, error: "This appointment can no longer be cancelled." };
  }
  if (appt.startAt.getTime() < Date.now()) {
    return { ok: false, error: "Past appointments can't be cancelled here." };
  }

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: "cancelled" },
  });

  // If this appointment had already materialized a (still-scheduled) Encounter,
  // cancel it too so it doesn't linger as a ghost card on the queue board.
  await cancelEncounterForAppointment(appt.id);

  // EMR-1115 (PJ-B4) — patient-side cancel now emits the same event the
  // clinic-side cancel does, so the lifecycle workflow sends the
  // cancellation notice regardless of who cancelled.
  await dispatch({
    name: "appointment.cancelled",
    appointmentId: appt.id,
    patientId: appt.patient.id,
    organizationId: appt.patient.organizationId,
    reason: null,
    source: "patient",
  });

  await prisma.auditLog.create({
    data: {
      organizationId: appt.patient.organizationId,
      actorUserId: user.id,
      action: "appointment.cancelled",
      subjectType: "Appointment",
      subjectId: appt.id,
      metadata: {
        previousStatus: appt.status,
        source: "patient",
        reason: null,
      },
    },
  });

  revalidatePath("/portal/schedule");
  return { ok: true };
}

const rescheduleSchema = z.object({
  appointmentId: z.string().min(1),
  slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotStartTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function rescheduleAppointment(
  payload: z.infer<typeof rescheduleSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string; code?: string }> {
  const user = await requireUser();
  const parsed = rescheduleSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid reschedule payload." };

  const appt = await prisma.appointment.findFirst({
    where: {
      id: parsed.data.appointmentId,
      patient: { userId: user.id, deletedAt: null },
    },
    include: {
      patient: { select: { organization: { select: { timeZone: true } } } },
    },
  });
  if (!appt) return { ok: false, error: "Appointment not found." };

  if (appt.status === "cancelled" || appt.status === "completed") {
    return { ok: false, error: "This appointment can no longer be rescheduled." };
  }

  // Interpret the new slot in the clinic's timezone (see bookAppointment).
  const timeZone = appt.patient.organization?.timeZone || DEFAULT_TIME_ZONE;
  const [rYear, rMonth, rDay] = parsed.data.slotDate.split("-").map(Number);
  const [rHour, rMinute] = parsed.data.slotStartTime.split(":").map(Number);
  const newStart = zonedTimeToUtc(timeZone, {
    year: rYear,
    month: rMonth,
    day: rDay,
    hour: rHour,
    minute: rMinute,
  });
  if (Number.isNaN(newStart.getTime())) {
    return { ok: false, error: "Invalid target time." };
  }
  if (newStart.getTime() < Date.now()) {
    return { ok: false, error: "Choose a time in the future." };
  }

  const durationMs = appt.endAt.getTime() - appt.startAt.getTime();
  const newEnd = new Date(newStart.getTime() + durationMs);

  if (appt.providerId) {
    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId: appt.providerId,
        id: { not: appt.id },
        status: { in: ["requested", "confirmed"] },
        startAt: { lt: newEnd },
        endAt: { gt: newStart },
      },
    });
    if (conflict) {
      return {
        ok: false,
        error: "That time conflicts with another booking. Pick another slot.",
        code: "CONFLICT",
      };
    }
  }

  await prisma.appointment.update({
    where: { id: appt.id },
    data: {
      startAt: newStart,
      endAt: newEnd,
      // A reschedule resets the confirmation flow — the practice
      // needs to re-acknowledge the new time.
      status: "requested",
    },
  });

  // Keep a materialized (still-scheduled) Encounter pointed at the new time so
  // the queue board doesn't show the old slot.
  await syncEncounterScheduleForAppointment(appt.id, newStart);

  revalidatePath("/portal/schedule");
  return { ok: true, id: appt.id };
}
