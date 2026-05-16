"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import type { OutcomeMetric } from "@prisma/client";

const METRICS: OutcomeMetric[] = ["pain", "sleep", "anxiety", "mood", "nausea"];

const metricSchema = z.coerce.number().int().min(0).max(10);

import { recordDailyCheckIn } from "@/lib/gamification/streaks";

export type OutcomeResult = { ok: true } | { ok: false; error: string };

export async function submitOutcomeAction(
  _prev: OutcomeResult | null,
  formData: FormData
): Promise<OutcomeResult> {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({ where: { userId: user.id } });
  if (!patient) return { ok: false, error: "No patient profile found." };

  // Parse each metric value
  const entries: { metric: OutcomeMetric; value: number }[] = [];
  for (const metric of METRICS) {
    const raw = formData.get(metric);
    if (raw === null || raw === "") {
      return { ok: false, error: `Please rate your ${metric} level before submitting.` };
    }
    const parsed = metricSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Invalid value for ${metric}.` };
    entries.push({ metric, value: parsed.data });
  }

  // Parse optional note
  const noteRaw = (formData.get("note") as string) ?? "";
  const note = noteRaw.trim().slice(0, 2000) || null;

  // Parse required positive note
  const positiveRaw = (formData.get("positiveNote") as string) ?? "";
  const positiveNote = positiveRaw.trim().slice(0, 2000);
  if (!positiveNote) {
    return { ok: false, error: "Please share something positive before submitting." };
  }

  // Build a combined note for the first metric that includes the positive reflection
  const firstNote = [note, `[Positive] ${positiveNote}`].filter(Boolean).join("\n");

  // Create all outcome log rows in a transaction
  await prisma.$transaction(
    entries.map((entry, idx) =>
      prisma.outcomeLog.create({
        data: {
          patientId: patient.id,
          metric: entry.metric,
          value: entry.value,
          note: idx === 0 ? firstNote : note,
        },
      })
    )
  );

  await recordDailyCheckIn(patient.id);

  revalidatePath("/portal/outcomes");
  revalidatePath("/portal");

  return { ok: true };
}
