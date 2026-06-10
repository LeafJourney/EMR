"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { requireUser, type AuthedUser } from "@/lib/auth/session";

// EMR-1110 (FO-M4) — explicit allowlist, matching the schedule actions.
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

const CreateSeriesSchema = z.object({
  title: z.string().min(2).max(120),
  topic: z.string().max(240).nullable(),
  firstStartIso: z.string(),
  durationMinutes: z.number().int().min(15).max(240),
  cadence: z.enum(["once", "weekly", "biweekly", "monthly"]),
  sessionCount: z.number().int().min(1).max(26),
  maxSeats: z.number().int().min(2).max(50),
  // EMR-1110 (FO-M4, minor 2) — explicit series lead. Optional for callers
  // who ARE a provider (their own profile is used); required otherwise so
  // we never silently write providerId: null.
  providerId: z.string().min(1).optional(),
});

export type CreateGroupSeriesInput = z.infer<typeof CreateSeriesSchema>;

/**
 * Create a series. We materialize one Appointment row per session as a
 * "placeholder" attached to a sentinel patient (the first organization
 * patient acts as the holder until invitees join). A real impl will use
 * an AppointmentSeries table; for now this keeps the schema untouched.
 *
 * We refuse to create a series longer than 6 months so a typo in
 * cadence/count doesn't pollute the calendar.
 */
export async function createGroupSeriesAction(
  input: CreateGroupSeriesInput,
): Promise<
  | { ok: true; seriesKey: string; sessionsCreated: number }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) return { ok: false, error: "No organization on session." };
  if (!canManageSchedule(user)) {
    return { ok: false, error: "You don't have permission to compose group series." };
  }
  const parsed = CreateSeriesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid series details." };
  const data = parsed.data;

  // Resolve the series lead. An explicit providerId (org-scoped) wins;
  // otherwise the caller's own provider profile. A caller with neither
  // (e.g. front office) must pick a provider — no more silent
  // providerId: null "Unassigned" series.
  let provider: { id: string } | null = null;
  if (data.providerId) {
    provider = await prisma.provider.findFirst({
      where: { id: data.providerId, organizationId: orgId, active: true },
      select: { id: true },
    });
    if (!provider) return { ok: false, error: "Selected provider not found in your organization." };
  } else {
    provider = await prisma.provider.findFirst({
      where: { organizationId: orgId, userId: user.id, active: true },
      select: { id: true },
    });
    if (!provider) {
      return {
        ok: false,
        error: "You don't have a provider profile — choose the provider who will lead this series.",
      };
    }
  }

  // Need a placeholder patient for the holder row — we'll use the first
  // active patient in the org. Group enrollment will replace this when
  // invitees join.
  const holder = await prisma.patient.findFirst({
    where: { organizationId: orgId, deletedAt: null },
    select: { id: true },
  });
  if (!holder) {
    return {
      ok: false,
      error: "Need at least one patient on file before composing a series.",
    };
  }

  const start = new Date(data.firstStartIso);
  if (Number.isNaN(start.getTime())) return { ok: false, error: "Invalid start time." };

  const seriesKey = randomUUID().slice(0, 8);
  const cadenceDays = cadenceToDays(data.cadence);
  const sessions = Array.from({ length: data.sessionCount }, (_, i) => {
    const s = new Date(start);
    s.setDate(s.getDate() + i * cadenceDays);
    const e = new Date(s.getTime() + data.durationMinutes * 60_000);
    return { startAt: s, endAt: e };
  });

  // Refuse to build more than 6 months out.
  const lastSession = sessions[sessions.length - 1];
  const sixMonthsOut = new Date();
  sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
  if (lastSession.startAt > sixMonthsOut) {
    return {
      ok: false,
      error: "Series extends beyond 6 months — shorten the cadence or session count.",
    };
  }

  const header = `#group${JSON.stringify({
    k: seriesKey,
    t: data.title,
    c: data.cadence,
    topic: data.topic ?? null,
    seats: data.maxSeats,
  })}\n`;

  await prisma.$transaction(
    sessions.map((s) =>
      prisma.appointment.create({
        data: {
          patientId: holder.id,
          providerId: provider.id,
          startAt: s.startAt,
          endAt: s.endAt,
          modality: "video",
          status: "requested",
          notes: header + "Series placeholder — invitees will replace this row when they join.",
        },
      }),
    ),
  );

  revalidatePath("/clinic/scheduling/groups");
  return { ok: true, seriesKey, sessionsCreated: sessions.length };
}

function cadenceToDays(c: CreateGroupSeriesInput["cadence"]): number {
  switch (c) {
    case "once": return 0;
    case "weekly": return 7;
    case "biweekly": return 14;
    case "monthly": return 30;
  }
}
