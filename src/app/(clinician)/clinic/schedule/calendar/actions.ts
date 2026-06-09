"use server";

// EMR-182 — Calendar grid server actions: drag-to-create + drag-to-
// reschedule. Org scoping rides through the patient/provider records
// so the action can't mutate a foreign appointment.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { syncEncounterScheduleForAppointment } from "@/lib/domain/ensure-encounter";

const ALLOWED_MODALITIES = ["video", "in_person", "phone"] as const;

const createSchema = z.object({
  patientId: z.string().min(1),
  providerId: z.string().nullable(),
  startIso: z.string(),
  durationMinutes: z.coerce.number().int().min(10).max(180),
  modality: z.enum(ALLOWED_MODALITIES),
  notes: z.string().max(500).optional().nullable(),
});

export type CreateAppointmentInput = z.infer<typeof createSchema>;
export type CreateAppointmentResult =
  | { ok: true; appointmentId: string }
  | { ok: false; error: string };

export async function createAppointmentAction(
  input: CreateAppointmentInput,
): Promise<CreateAppointmentResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No organization." };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid appointment." };

  const start = new Date(parsed.data.startIso);
  if (Number.isNaN(start.getTime())) {
    return { ok: false, error: "Invalid start time." };
  }
  const end = new Date(start.getTime() + parsed.data.durationMinutes * 60_000);

  const patient = await prisma.patient.findFirst({
    where: { id: parsed.data.patientId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!patient) return { ok: false, error: "Patient not in your org." };

  if (parsed.data.providerId) {
    const provider = await prisma.provider.findFirst({
      where: {
        id: parsed.data.providerId,
        organizationId: user.organizationId,
      },
      select: { id: true },
    });
    if (!provider) return { ok: false, error: "Provider not in your org." };

    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId: parsed.data.providerId,
        status: { in: ["requested", "confirmed"] },
        startAt: { lt: end },
        endAt: { gt: start },
      },
    });
    if (conflict) {
      return { ok: false, error: "That slot conflicts with another appointment." };
    }
  }

  const appt = await prisma.appointment.create({
    data: {
      patientId: parsed.data.patientId,
      providerId: parsed.data.providerId,
      startAt: start,
      endAt: end,
      modality: parsed.data.modality,
      status: "requested",
      notes: parsed.data.notes ?? null,
    },
    select: { id: true },
  });

  revalidatePath("/clinic/schedule/calendar");
  return { ok: true, appointmentId: appt.id };
}

const rescheduleSchema = z.object({
  appointmentId: z.string().min(1),
  newStartIso: z.string(),
});

export async function rescheduleAppointmentAction(
  input: z.infer<typeof rescheduleSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No organization." };
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid reschedule." };

  const appt = await prisma.appointment.findFirst({
    where: {
      id: parsed.data.appointmentId,
      patient: { organizationId: user.organizationId },
    },
  });
  if (!appt) return { ok: false, error: "Appointment not found." };

  const newStart = new Date(parsed.data.newStartIso);
  if (Number.isNaN(newStart.getTime())) {
    return { ok: false, error: "Invalid target time." };
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
        error: "That slot conflicts with another appointment for this provider.",
      };
    }
  }

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { startAt: newStart, endAt: newEnd },
  });

  // Keep a materialized (still-scheduled) Encounter aligned with the new slot.
  await syncEncounterScheduleForAppointment(appt.id, newStart);

  revalidatePath("/clinic/schedule/calendar");
  return { ok: true };
}
