"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { ensureEncounterForAppointment } from "@/lib/domain/ensure-encounter";

const rescheduleSchema = z.object({
  appointmentId: z.string(),
  newStartIso: z.string(),
  force: z.boolean().optional(),
});

/**
 * EMR-182: drag-to-reschedule. The client drops an appointment onto a
 * new 30-min square; this action moves the start (and end, preserving
 * the duration) to that slot. Org-scoped via the patient record.
 */
export async function rescheduleAppointmentAction(
  payload: z.infer<typeof rescheduleSchema>,
): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  const user = await requireUser();
  const parsed = rescheduleSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid drop payload." };

  const appt = await prisma.appointment.findFirst({
    where: {
      id: parsed.data.appointmentId,
      patient: { organizationId: user.organizationId! },
    },
  });
  if (!appt) return { ok: false, error: "Appointment not found." };

  const newStart = new Date(parsed.data.newStartIso);
  if (Number.isNaN(newStart.getTime())) {
    return { ok: false, error: "Invalid target time." };
  }
  const durationMs = appt.endAt.getTime() - appt.startAt.getTime();
  const newEnd = new Date(newStart.getTime() + durationMs);

  // Conflict check — prevent stacking two appointments on the same
  // provider in the same window. We allow back-to-back exactly (no
  // gap).
  if (appt.providerId && !parsed.data.force) {
    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId: appt.providerId,
        id: { not: appt.id },
        startAt: { lt: newEnd },
        endAt: { gt: newStart },
      },
    });
    if (conflict) {
      return {
        ok: false,
        error: "That slot conflicts with another appointment for this provider.",
        code: "CONFLICT",
      };
    }
  }

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { startAt: newStart, endAt: newEnd },
  });

  revalidatePath("/clinic/schedule");
  return { ok: true };
}

const createAppointmentSchema = z.object({
  patientId: z.string(),
  startIso: z.string(),
  endIso: z.string(),
  notes: z.string().optional(),
  modality: z.string().default("in_person"),
  force: z.boolean().optional(),
});

export async function createPatientAppointmentAction(
  payload: z.infer<typeof createAppointmentSchema>,
): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  const user = await requireUser();
  const parsed = createAppointmentSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid appointment payload." };

  const { patientId, startIso, endIso, notes, modality, force } = parsed.data;
  const startAt = new Date(startIso);
  const endAt = new Date(endIso);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return { ok: false, error: "Invalid dates." };
  }

  // Get active provider for user
  const provider = await prisma.provider.findFirst({
    where: { userId: user.id, organizationId: user.organizationId! },
    select: { id: true },
  });
  if (!provider) return { ok: false, error: "No provider profile found for current user." };

  // Check conflicts
  if (!force) {
    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId: provider.id,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (conflict) {
      return {
        ok: false,
        error: "That slot conflicts with another appointment for this provider.",
        code: "CONFLICT",
      };
    }
  }

  const appointment = await prisma.appointment.create({
    data: {
      patientId,
      providerId: provider.id,
      startAt,
      endAt,
      notes,
      modality,
      status: "confirmed",
    },
  });

  // Materialize the visit Encounter now so the patient is immediately
  // checkinable and shows on the queue board (idempotent via the @unique
  // appointmentId; the queue's day-of backstop also covers this).
  await ensureEncounterForAppointment(appointment.id);

  revalidatePath("/clinic/schedule");
  return { ok: true };
}

const createBlockSchema = z.object({
  startIso: z.string(),
  endIso: z.string(),
  reason: z.enum(["meeting", "vacation", "do_not_book"]),
  notes: z.string().optional(),
  force: z.boolean().optional(),
});

export async function createSpecialBlockAction(
  payload: z.infer<typeof createBlockSchema>,
): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  const user = await requireUser();
  const parsed = createBlockSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid block payload." };

  const { startIso, endIso, reason, notes, force } = parsed.data;
  const startAt = new Date(startIso);
  const endAt = new Date(endIso);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return { ok: false, error: "Invalid dates." };
  }

  // Get or create placeholder patient
  let patient = await prisma.patient.findFirst({
    where: {
      organizationId: user.organizationId!,
      firstName: "System",
      lastName: "CalendarBlock",
    },
  });
  if (!patient) {
    patient = await prisma.patient.create({
      data: {
        organizationId: user.organizationId!,
        firstName: "System",
        lastName: "CalendarBlock",
        status: "active",
      },
    });
  }

  const provider = await prisma.provider.findFirst({
    where: { userId: user.id, organizationId: user.organizationId! },
    select: { id: true },
  });
  if (!provider) return { ok: false, error: "No provider profile found for current user." };

  // Check conflicts
  if (!force) {
    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId: provider.id,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (conflict) {
      return {
        ok: false,
        error: "That slot conflicts with another appointment for this provider.",
        code: "CONFLICT",
      };
    }
  }

  // Save the block prefixing notes with the reason tag
  const blockNotes = `[CalendarBlock:${reason.toUpperCase()}] ${notes || ""}`.trim();

  await prisma.appointment.create({
    data: {
      patientId: patient.id,
      providerId: provider.id,
      startAt,
      endAt,
      notes: blockNotes,
      modality: "in_person",
      status: "confirmed",
    },
  });

  revalidatePath("/clinic/schedule");
  return { ok: true };
}
