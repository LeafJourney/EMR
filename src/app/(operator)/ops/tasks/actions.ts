"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

// EMR-1079 (Back-Office Operations Audit §6.5) — the unified staff worklist.
// Per-patient "open tasks" already exist; this surface rolls them into one
// queue the back office can actually work. These actions let staff close out
// or reopen a task from that queue.

const WORKLIST_ROLES = new Set<string>([
  "front_office",
  "back_office",
  "operator",
  "practice_owner",
  "practice_admin",
  "system",
]);

const TaskActionSchema = z.object({ taskId: z.string().min(1) });

export type TaskActionResult = { ok: true } | { ok: false; error: string };

export async function completeTask(input: {
  taskId: string;
}): Promise<TaskActionResult> {
  return mutate(input, "done");
}

export async function reopenTask(input: {
  taskId: string;
}): Promise<TaskActionResult> {
  return mutate(input, "open");
}

async function mutate(
  input: unknown,
  target: "done" | "open",
): Promise<TaskActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Missing organization." };
  if (!user.roles.some((r) => WORKLIST_ROLES.has(r))) {
    return { ok: false, error: "Forbidden." };
  }

  const parsed = TaskActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  // Org-scope: only act on a task in the caller's practice.
  const task = await prisma.task.findFirst({
    where: { id: parsed.data.taskId, organizationId: user.organizationId },
    select: { id: true, status: true },
  });
  if (!task) return { ok: false, error: "Task not found." };

  if (task.status === target) {
    revalidatePath("/ops/tasks");
    return { ok: true };
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      status: target,
      // Stamp/clear completion so the rollup counts and "completed" filter
      // stay honest.
      completedAt: target === "done" ? new Date() : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: target === "done" ? "task.completed" : "task.reopened",
      subjectType: "Task",
      subjectId: task.id,
      metadata: { from: task.status, to: target },
    },
  });

  revalidatePath("/ops/tasks");
  return { ok: true };
}
