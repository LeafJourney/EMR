"use server";

// NOTE (EMR-1110 / FO-3): the drag-to-reschedule action that used to live
// here was a duplicate of the one in ./calendar/actions.ts. The calendar
// version is now the single code path (role-gated, cancelled-aware,
// force-capable) — callers import rescheduleAppointmentAction and
// cancelAppointmentAction from "./calendar/actions".

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser, type AuthedUser } from "@/lib/auth/session";
import { ensureEncounterForAppointment } from "@/lib/domain/ensure-encounter";
import { CALENDAR_BLOCK_PATIENT } from "@/lib/domain/calendar-block-patient";

// Explicit allowlist (QUEUE_STATE_ROLES style) — scheduling is policy,
// not a side effect of being authenticated.
const SCHEDULING_ROLES = new Set([
  "front_office",
  "back_office",
  "clinician",
  "practice_owner",
  "operator",
]);

function canManageSchedule(user: AuthedUser): boolean {
  return user.roles.some((role) => SCHEDULING_ROLES.has(role));
}

// Cancelled / no-show appointments never occupy a slot.
const ACTIVE_STATUSES = ["requested", "confirmed"] as const;

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
  if (!canManageSchedule(user)) {
    return { ok: false, error: "You don't have permission to manage the schedule." };
  }
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

  // Check conflicts — cancelled appointments don't block the slot.
  if (!force) {
    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId: provider.id,
        status: { in: [...ACTIVE_STATUSES] },
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
  if (!canManageSchedule(user)) {
    return { ok: false, error: "You don't have permission to manage the schedule." };
  }
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
      ...CALENDAR_BLOCK_PATIENT,
    },
  });
  if (!patient) {
    patient = await prisma.patient.create({
      data: {
        organizationId: user.organizationId!,
        ...CALENDAR_BLOCK_PATIENT,
        status: "active",
      },
    });
  }

  const provider = await prisma.provider.findFirst({
    where: { userId: user.id, organizationId: user.organizationId! },
    select: { id: true },
  });
  if (!provider) return { ok: false, error: "No provider profile found for current user." };

  // Check conflicts — cancelled appointments don't block the slot.
  if (!force) {
    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId: provider.id,
        status: { in: [...ACTIVE_STATUSES] },
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
