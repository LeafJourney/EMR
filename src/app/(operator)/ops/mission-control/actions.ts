"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { approveJob, rejectJob } from "@/lib/orchestration/queue";
import { prisma } from "@/lib/db/prisma";

export async function approveJobAction(jobId: string) {
  const user = await requireUser();
  await approveJob(jobId, user.id);
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
  await rejectJob(jobId, user.id, "Rejected in Mission Control");
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

export interface BulkDecisionResult {
  ok: boolean;
  count: number;
  failed: number;
}

/**
 * Owner-initiated bulk approve/reject over the org-scoped approval queue.
 *
 * Loads every job currently in `needs_approval` for the caller's org (mirrors
 * the org filter the Mission Control page uses), then applies the single-job
 * `approveJob`/`rejectJob` per job so audit logging + side-effects stay
 * identical to the single-job actions (one auditLog row per job). Individual
 * failures are tolerated and counted, not aborted, so one bad job can't strand
 * the rest of the queue.
 */
export async function bulkDecisionAction(
  decision: "approve" | "reject",
): Promise<BulkDecisionResult> {
  const user = await requireUser();

  // Mirror the page's org filter: this org's jobs plus org-less (shared) jobs.
  const orgFilter = user.organizationId
    ? { OR: [{ organizationId: user.organizationId }, { organizationId: null }] }
    : {};

  const jobs = await prisma.agentJob.findMany({
    where: { ...orgFilter, status: "needs_approval" as const },
    select: { id: true },
  });

  let count = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      if (decision === "approve") {
        await approveJob(job.id, user.id);
        await prisma.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "agent.job.approved",
            subjectType: "AgentJob",
            subjectId: job.id,
            organizationId: user.organizationId ?? undefined,
          },
        });
      } else {
        await rejectJob(job.id, user.id, "Rejected in Mission Control (bulk)");
        await prisma.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "agent.job.rejected",
            subjectType: "AgentJob",
            subjectId: job.id,
            organizationId: user.organizationId ?? undefined,
          },
        });
      }
      count += 1;
    } catch {
      // Skip the bad job; keep draining the rest of the queue.
      failed += 1;
    }
  }

  revalidatePath("/ops/mission-control");
  revalidatePath("/ops");

  return { ok: true, count, failed };
}

export async function approveAllJobsAction() {
  return bulkDecisionAction("approve");
}

export async function rejectAllJobsAction() {
  return bulkDecisionAction("reject");
}
