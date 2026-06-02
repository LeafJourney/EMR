"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { requireUser, type AuthedUser } from "@/lib/auth/session";
import { approveJob, rejectJob } from "@/lib/orchestration/queue";
import { prisma } from "@/lib/db/prisma";

// Roles permitted to drive Mission Control. The route group's layout already
// gates the UI, but server actions are independently invocable, so re-check
// here and resolve the org so a raw jobId can't authorize a cross-org or
// non-operator approval (EMR-805).
const OPERATOR_ROLES: Role[] = ["operator", "practice_owner", "system"];

function requireOperatorOrg(user: AuthedUser): string {
  if (!user.roles.some((r) => OPERATOR_ROLES.includes(r))) {
    throw new Error("FORBIDDEN");
  }
  if (!user.organizationId) throw new Error("FORBIDDEN");
  return user.organizationId;
}

export async function approveJobAction(jobId: string) {
  const user = await requireUser();
  const organizationId = requireOperatorOrg(user);
  await approveJob(jobId, user.id, organizationId);
  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "agent.job.approved",
      subjectType: "AgentJob",
      subjectId: jobId,
      organizationId: user.organizationId ?? undefined,
    },
  });
  revalidatePath("/ops/mission-control");
  revalidatePath("/ops");
}

export async function rejectJobAction(jobId: string) {
  const user = await requireUser();
  const organizationId = requireOperatorOrg(user);
  await rejectJob(jobId, user.id, "Rejected in Mission Control", organizationId);
  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "agent.job.rejected",
      subjectType: "AgentJob",
      subjectId: jobId,
      organizationId: user.organizationId ?? undefined,
    },
  });
  revalidatePath("/ops/mission-control");
  revalidatePath("/ops");
}
