"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import type { OutcomeMetric } from "@prisma/client";

/**
 * Quick-log a single symptom rating (1-10) from the floating action button.
 * Powers the portal-wide quick-symptom FAB — one metric, one value, go.
 */

const ALLOWED_METRICS = [
  "pain",
  "sleep",
  "anxiety",
  "nausea",
  "energy",
  "mood",
] as const satisfies readonly OutcomeMetric[];

const quickLogSchema = z.object({
  metric: z.enum(ALLOWED_METRICS),
  value: z.coerce.number().int().min(0).max(10),
  note: z.string().max(500).optional().nullable(),
});

import { recordDailyCheckIn } from "@/lib/gamification/streaks";

export type QuickLogResult =
  | { ok: true; newlyEarnedBadges?: any[] }
  | { ok: false; error: string };

export async function quickLogSymptom(input: {
  metric: (typeof ALLOWED_METRICS)[number];
  value: number;
  note?: string | null;
}): Promise<QuickLogResult> {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!patient) return { ok: false, error: "No patient profile found." };

  const parsed = quickLogSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid symptom input." };

  const { metric, value, note } = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.outcomeLog.create({
      data: {
        patientId: patient.id,
        metric,
        value,
        note: note?.trim() ? `[quick-fab] ${note.trim()}` : "[quick-fab]",
      },
    });
  });
  
  const result = await recordDailyCheckIn(patient.id);

  revalidatePath("/portal");
  revalidatePath("/portal/outcomes");

  return { ok: true, newlyEarnedBadges: result.newlyEarnedBadges };
}
