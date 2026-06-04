"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import type { AppointmentType } from "@/lib/domain/scheduling";

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
  });
  if (!patient) throw new Error("Patient not found or unauthorized.");
  return patient;
}

export async function bookAppointment(
  input: BookAppointmentInput,
): Promise<BookAppointmentResult> {
  const user = await requireUser();
  await getOwnedPatient(user.id, input.patientId);

  const startAt = new Date(`${input.slotDate}T${input.slotStartTime}:00`);
  if (Number.isNaN(startAt.getTime())) {
    return { ok: false, error: "Invalid appointment time." };
  }
  if (startAt.getTime() < Date.now()) {
    return { ok: false, error: "Choose a time in the future." };
  }

  const endAt = new Date(
    startAt.getTime() + durationMinutesFor(input.appointmentType) * 60_000,
  );

  // Don't let the portal double-book a provider's slot. rescheduleAppointment
  // already enforces this guard; bookAppointment skipped it, so two patients
  // (or one patient clicking twice) could create overlapping "requested"
  // appointments on the same provider.
  if (input.providerId) {
    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId: input.providerId,
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
  });
  if (!appt) return { ok: false, error: "Appointment not found." };

  if (appt.status === "cancelled" || appt.status === "completed") {
    return { ok: false, error: "This appointment can no longer be rescheduled." };
  }

  const newStart = new Date(`${parsed.data.slotDate}T${parsed.data.slotStartTime}:00`);
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

  revalidatePath("/portal/schedule");
  return { ok: true, id: appt.id };
}
