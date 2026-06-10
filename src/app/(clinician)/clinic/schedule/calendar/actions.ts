"use server";

// EMR-182 — Calendar grid server actions: drag-to-create + drag-to-
// reschedule. Org scoping rides through the patient/provider records
// so the action can't mutate a foreign appointment.
//
// EMR-1110 (FO-3) — this file is the single home for appointment
// mutations (create / reschedule / cancel). The old duplicate
// reschedule in ../actions.ts was removed; both /clinic/schedule and
// /clinic/schedule/calendar call these actions. All mutations are
// gated on an explicit scheduling-role allowlist (QUEUE_STATE_ROLES
// style) instead of relying on requireUser alone.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser, type AuthedUser } from "@/lib/auth/session";
import {
  cancelEncounterForAppointment,
  syncEncounterScheduleForAppointment,
} from "@/lib/domain/ensure-encounter";
import { dispatch } from "@/lib/orchestration/dispatch";

const ALLOWED_MODALITIES = ["video", "in_person", "phone"] as const;

// Roles that may create / move / cancel appointments. Mirrors
// QUEUE_STATE_ROLES in ops/queue/actions.ts: explicit allowlist, not
// "anything authenticated".
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

// Statuses that occupy a slot. Cancelled / no-show appointments never
// count toward provider conflicts.
const ACTIVE_STATUSES = ["requested", "confirmed"] as const;

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
  if (!canManageSchedule(user)) {
    return { ok: false, error: "You don't have permission to manage the schedule." };
  }
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
        status: { in: [...ACTIVE_STATUSES] },
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

  revalidatePath("/clinic/schedule");
  revalidatePath("/clinic/schedule/calendar");
  return { ok: true, appointmentId: appt.id };
}

const rescheduleSchema = z.object({
  appointmentId: z.string().min(1),
  newStartIso: z.string(),
  // Explicit double-book override (the schedule week grid surfaces a
  // confirm dialog when the first attempt reports CONFLICT).
  force: z.boolean().optional(),
});

export async function rescheduleAppointmentAction(
  input: z.infer<typeof rescheduleSchema>,
): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No organization." };
  if (!canManageSchedule(user)) {
    return { ok: false, error: "You don't have permission to manage the schedule." };
  }
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid reschedule." };

  const appt = await prisma.appointment.findFirst({
    where: {
      id: parsed.data.appointmentId,
      patient: { organizationId: user.organizationId },
    },
  });
  if (!appt) return { ok: false, error: "Appointment not found." };
  if (appt.status === "cancelled") {
    return { ok: false, error: "This appointment is cancelled — book a new one instead." };
  }

  const newStart = new Date(parsed.data.newStartIso);
  if (Number.isNaN(newStart.getTime())) {
    return { ok: false, error: "Invalid target time." };
  }
  const durationMs = appt.endAt.getTime() - appt.startAt.getTime();
  const newEnd = new Date(newStart.getTime() + durationMs);

  if (appt.providerId && !parsed.data.force) {
    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId: appt.providerId,
        id: { not: appt.id },
        status: { in: [...ACTIVE_STATUSES] },
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

  // Keep a materialized (still-scheduled) Encounter aligned with the new slot.
  await syncEncounterScheduleForAppointment(appt.id, newStart);

  revalidatePath("/clinic/schedule");
  revalidatePath("/clinic/schedule/calendar");
  return { ok: true };
}

// ── Cancel — EMR-1110 / FO-M1 ───────────────────────────────────────
//
// The Appointment model has no dedicated cancellation-reason column, so
// the reason is recorded on the audit log entry (and the status flips to
// "cancelled"). Cancelling also cancels a still-`scheduled` materialized
// Encounter so the queue board doesn't keep a ghost card, and emits the
// (already-typed) `appointment.cancelled` domain event — no workflow
// consumes it yet, so dispatch() is a safe fire-and-forget no-op until
// one subscribes.

const cancelSchema = z.object({
  appointmentId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export type CancelAppointmentInput = z.infer<typeof cancelSchema>;

export async function cancelAppointmentAction(
  input: CancelAppointmentInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No organization." };
  if (!canManageSchedule(user)) {
    return { ok: false, error: "You don't have permission to cancel appointments." };
  }
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid cancellation." };

  const appt = await prisma.appointment.findFirst({
    where: {
      id: parsed.data.appointmentId,
      patient: { organizationId: user.organizationId },
    },
    select: { id: true, status: true },
  });
  if (!appt) return { ok: false, error: "Appointment not found." };

  // Idempotent: a second cancel (double click, stale tab) is a no-op —
  // no second status write, event, or audit entry.
  if (appt.status === "cancelled") return { ok: true };

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: "cancelled" },
  });

  // Release any still-scheduled Encounter so the queue board stays honest.
  await cancelEncounterForAppointment(appt.id);

  await dispatch({ name: "appointment.cancelled", appointmentId: appt.id });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "appointment.cancelled",
      subjectType: "Appointment",
      subjectId: appt.id,
      metadata: {
        previousStatus: appt.status,
        reason: parsed.data.reason?.trim() || null,
      },
    },
  });

  revalidatePath("/clinic/schedule");
  revalidatePath("/clinic/schedule/calendar");
  return { ok: true };
}
