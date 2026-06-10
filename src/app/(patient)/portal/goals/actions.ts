"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { GOAL_METRIC_LABELS, type GoalMetric } from "@/lib/domain/treatment-goals";

/**
 * EMR-1113 (PJ-1) — treatment goal persistence.
 *
 * Goals used to be demo seeds living in client state (the NewGoalForm's
 * "Save goal" never left the browser). These actions back the form with the
 * TreatmentGoal table; progress is still computed at read time from the
 * patient's OutcomeLog series for the goal's metric.
 */

const GOAL_METRICS = Object.keys(GOAL_METRIC_LABELS) as [GoalMetric, ...GoalMetric[]];

const createGoalSchema = z.object({
  metric: z.enum(GOAL_METRICS),
  baseline: z.coerce.number().int().min(1).max(10),
  target: z.coerce.number().int().min(1).max(10),
  targetDate: z.string().trim().optional().nullable(),
});

export type GoalActionResult = { ok: true } | { ok: false; error: string };

export async function createGoal(input: {
  metric: GoalMetric;
  baseline: number;
  target: number;
  targetDate?: string | null;
}): Promise<GoalActionResult> {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, organizationId: true },
  });
  if (!patient) return { ok: false, error: "No patient profile found." };

  const parsed = createGoalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid goal — please try again." };

  const { metric, baseline, target, targetDate } = parsed.data;
  if (baseline === target) {
    return { ok: false, error: "Pick a target that's different from where you are today." };
  }

  let targetDateValue: Date | null = null;
  if (targetDate) {
    const d = new Date(targetDate);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid target date." };
    targetDateValue = d;
  }

  const goal = await prisma.treatmentGoal.create({
    data: {
      organizationId: patient.organizationId,
      patientId: patient.id,
      metric,
      label: GOAL_METRIC_LABELS[metric].label,
      baselineValue: baseline,
      targetValue: target,
      targetDate: targetDateValue,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: patient.organizationId,
      actorUserId: user.id,
      action: "patient.goal.created",
      subjectType: "TreatmentGoal",
      subjectId: goal.id,
      metadata: { metric, baseline, target, targetDate: targetDateValue?.toISOString() ?? null },
    },
  });

  revalidatePath("/portal/goals");
  revalidatePath("/portal");
  return { ok: true };
}

const setStatusSchema = z.object({
  goalId: z.string().trim().min(1).max(64),
  status: z.enum(["achieved", "abandoned"]),
});

export async function setGoalStatus(input: {
  goalId: string;
  status: "achieved" | "abandoned";
}): Promise<GoalActionResult> {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, organizationId: true },
  });
  if (!patient) return { ok: false, error: "No patient profile found." };

  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { goalId, status } = parsed.data;

  // Ownership check — the goal must belong to this patient.
  const goal = await prisma.treatmentGoal.findFirst({
    where: { id: goalId, patientId: patient.id },
    select: { id: true },
  });
  if (!goal) return { ok: false, error: "Goal not found." };

  await prisma.treatmentGoal.update({
    where: { id: goal.id },
    data: { status },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: patient.organizationId,
      actorUserId: user.id,
      action: status === "achieved" ? "patient.goal.achieved" : "patient.goal.archived",
      subjectType: "TreatmentGoal",
      subjectId: goal.id,
      metadata: { status },
    },
  });

  revalidatePath("/portal/goals");
  revalidatePath("/portal");
  return { ok: true };
}
