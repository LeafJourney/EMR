"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

// EMR-1108 (FO-1, Front-Office Workflow Audit FO-B1) — clinic-side task
// worklist actions. Visit completion routes Tasks to assigneeRole
// "front_office" (notes/[noteId]/actions.ts), but the only worklist was
// /ops/tasks behind the operator layout — front office could never see or
// work its own tasks. These actions power /clinic/tasks, the role-scoped
// worklist inside the clinic shell.
//
// Role gate mirrors WORKLIST_ROLES in ops/tasks/actions.ts, widened to the
// clinical staff who also receive role-routed tasks (clinician/midlevel).
// Patient and kiosk logins are deliberately excluded.

const CLINIC_TASK_ROLES = new Set<string>([
  "front_office",
  "back_office",
  "clinician",
  "midlevel",
  "practice_owner",
  "practice_admin",
  "operator",
  "system",
]);

const TaskActionSchema = z.object({ taskId: z.string().min(1) });

export type ClinicTaskActionResult = { ok: true } | { ok: false; error: string };

type AuthedTaskContext = {
  user: { id: string; organizationId: string };
  task: {
    id: string;
    status: string;
    assigneeUserId: string | null;
  };
};

type AuthResult =
  | { ok: true; ctx: AuthedTaskContext }
  | { ok: false; error: string };

/**
 * Shared preamble: requireUser → explicit role gate → org-scoped task load.
 * Returning `{ ok: false }` (never throwing) keeps the result shape uniform
 * for the client list, matching the ops worklist convention.
 */
async function authorize(input: unknown): Promise<AuthResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Missing organization." };
  if (!user.roles.some((r) => CLINIC_TASK_ROLES.has(r))) {
    return { ok: false, error: "Forbidden." };
  }

  const parsed = TaskActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  // Org-scope: only act on a task in the caller's practice.
  const task = await prisma.task.findFirst({
    where: { id: parsed.data.taskId, organizationId: user.organizationId },
    select: { id: true, status: true, assigneeUserId: true },
  });
  if (!task) return { ok: false, error: "Task not found." };

  return {
    ok: true,
    ctx: { user: { id: user.id, organizationId: user.organizationId }, task },
  };
}

async function audit(
  ctx: AuthedTaskContext,
  action: string,
  metadata: Prisma.InputJsonObject,
) {
  await prisma.auditLog.create({
    data: {
      organizationId: ctx.user.organizationId,
      actorUserId: ctx.user.id,
      action,
      subjectType: "Task",
      subjectId: ctx.task.id,
      metadata,
    },
  });
}

/**
 * Claim a task: assign it to the caller and move it to in_progress so the
 * rest of the desk can see it's being worked. Idempotent when the caller
 * already holds it in progress.
 */
export async function claimTask(input: {
  taskId: string;
}): Promise<ClinicTaskActionResult> {
  const auth = await authorize(input);
  if (!auth.ok) return auth;
  const { task, user } = auth.ctx;

  if (task.status === "done" || task.status === "cancelled") {
    return { ok: false, error: "Task is already closed — reopen it first." };
  }

  // Idempotent: already mine and already in progress.
  if (task.assigneeUserId === user.id && task.status === "in_progress") {
    revalidatePath("/clinic/tasks");
    return { ok: true };
  }

  await prisma.task.update({
    where: { id: task.id },
    data: { assigneeUserId: user.id, status: "in_progress" },
  });

  await audit(auth.ctx, "task.claimed", {
    from: task.status,
    to: "in_progress",
    previousAssigneeUserId: task.assigneeUserId,
  });

  revalidatePath("/clinic/tasks");
  return { ok: true };
}

/** Complete a task. Idempotent when it is already done. */
export async function completeTask(input: {
  taskId: string;
}): Promise<ClinicTaskActionResult> {
  const auth = await authorize(input);
  if (!auth.ok) return auth;
  const { task } = auth.ctx;

  if (task.status === "done") {
    revalidatePath("/clinic/tasks");
    return { ok: true };
  }

  await prisma.task.update({
    where: { id: task.id },
    data: { status: "done", completedAt: new Date() },
  });

  await audit(auth.ctx, "task.completed", { from: task.status, to: "done" });

  revalidatePath("/clinic/tasks");
  return { ok: true };
}

/** Reopen a completed/cancelled task. Idempotent when it is already open. */
export async function reopenTask(input: {
  taskId: string;
}): Promise<ClinicTaskActionResult> {
  const auth = await authorize(input);
  if (!auth.ok) return auth;
  const { task } = auth.ctx;

  if (task.status === "open") {
    revalidatePath("/clinic/tasks");
    return { ok: true };
  }

  await prisma.task.update({
    where: { id: task.id },
    // Clear the completion stamp so rollup counts stay honest (mirrors
    // ops/tasks/actions.ts).
    data: { status: "open", completedAt: null },
  });

  await audit(auth.ctx, "task.reopened", { from: task.status, to: "open" });

  revalidatePath("/clinic/tasks");
  return { ok: true };
}
