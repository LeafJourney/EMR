"use server";

/**
 * Bulk server actions for the smart inbox (/clinic/messages).
 *
 * Operate on `MessageThread` IDs (the inbox is a thread-list, not a flat
 * message list). Each action wraps the equivalent single-item mutation in
 * a transaction so an operator clearing 30 stale threads atomically
 * either sees the whole sweep applied or nothing.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";

const threadIdsSchema = z.object({
  threadIds: z.array(z.string().min(1)).min(1).max(500),
});

type BulkResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

// ------------------------------------------------------------- mark read

/**
 * Mark every message in the selected threads as `read`. We update the
 * messages directly (not the thread) because read-state is per-message
 * in the current schema. Limited to the org via the thread.patient
 * relation so a malicious thread id from another org is a no-op.
 */
export async function bulkMarkThreadsReadAction(
  input: z.infer<typeof threadIdsSchema>,
): Promise<BulkResult> {
  const user = await requireUser();
  const parsed = threadIdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid selection." };

  // Resolve only threads in our org.
  const threads = await prisma.messageThread.findMany({
    where: {
      id: { in: parsed.data.threadIds },
      patient: { organizationId: user.organizationId! },
    },
    select: { id: true },
  });
  const ownedIds = threads.map((t) => t.id);
  if (ownedIds.length === 0) return { ok: true, count: 0 };

  const result = await prisma.message.updateMany({
    where: {
      threadId: { in: ownedIds },
      status: { not: "read" },
    },
    data: { status: "read" },
  });

  revalidatePath("/clinic/messages");
  return { ok: true, count: result.count };
}

// --------------------------------------------------------------- resolve

/**
 * "Resolve" a batch of threads. The smart inbox today uses
 * `triagedAt`/`triageUrgency` for triage state; there is no explicit
 * `resolved` column. We stamp a clear marker via a `triageSummary` rider
 * and persist a resolution row in AuditLog so the operator's bulk action
 * is recoverable downstream.
 *
 * TODO(EMR-660) — adopt the dedicated `resolved` column once the inbox
 * spec lands; this wrapper keeps the bar API stable in the meantime.
 */
export async function bulkResolveThreadsAction(
  input: z.infer<typeof threadIdsSchema>,
): Promise<BulkResult> {
  const user = await requireUser();
  const parsed = threadIdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid selection." };

  const threads = await prisma.messageThread.findMany({
    where: {
      id: { in: parsed.data.threadIds },
      patient: { organizationId: user.organizationId! },
    },
    select: { id: true, triageSummary: true },
  });
  if (threads.length === 0) return { ok: true, count: 0 };

  await prisma.$transaction([
    ...threads.map((t) =>
      prisma.messageThread.update({
        where: { id: t.id },
        data: {
          triageSummary: t.triageSummary
            ? `${t.triageSummary} · resolved`
            : "resolved",
        },
      }),
    ),
    prisma.auditLog.createMany({
      data: threads.map((t) => ({
        organizationId: user.organizationId!,
        actorUserId: user.id,
        action: "message_thread.bulk_resolved",
        subjectType: "MessageThread",
        subjectId: t.id,
        metadata: { batchSize: threads.length } as object,
      })),
    }),
  ]);

  revalidatePath("/clinic/messages");
  return { ok: true, count: threads.length };
}

// ----------------------------------------------------------- assign to me

/**
 * Assign a batch of threads to the current operator. The thread schema
 * has no `assignedUserId` column today (EMR-666 will introduce it), so
 * we log the intent through the audit log; the inbox grouping picks up
 * `assignment.thread.assigned` entries via the existing keyboard island
 * read-side once that lands.
 *
 * TODO(EMR-666) — replace the audit-only path with a real assignedUserId
 * write when the model lands.
 */
export async function bulkAssignThreadsToMeAction(
  input: z.infer<typeof threadIdsSchema>,
): Promise<BulkResult> {
  const user = await requireUser();
  const parsed = threadIdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid selection." };

  const owned = await prisma.messageThread.findMany({
    where: {
      id: { in: parsed.data.threadIds },
      patient: { organizationId: user.organizationId! },
    },
    select: { id: true },
  });

  if (owned.length === 0) return { ok: true, count: 0 };

  await prisma.auditLog.createMany({
    data: owned.map((t) => ({
      organizationId: user.organizationId!,
      actorUserId: user.id,
      action: "message_thread.assigned",
      subjectType: "MessageThread",
      subjectId: t.id,
      metadata: { assignedToUserId: user.id, batchSize: owned.length } as object,
    })),
  });

  revalidatePath("/clinic/messages");
  return { ok: true, count: owned.length };
}

// --------------------------------------------------------------- export

/**
 * Export selected threads' meta (no message bodies — PHI export wants
 * the dedicated bulk-PHI route + audit; this is a "rolodex export" of
 * subjects / patient / status only).
 */
export async function bulkExportThreadsAction(input: {
  threadIds: string[];
}): Promise<
  | {
      ok: true;
      rows: Array<{
        id: string;
        subject: string;
        patientName: string;
        lastMessageAt: string;
        priority: string | null;
        category: string | null;
      }>;
    }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  const orgId = user.organizationId!;
  if (!input.threadIds?.length) return { ok: false, error: "No threads selected." };

  const rows = await prisma.messageThread.findMany({
    where: {
      id: { in: input.threadIds },
      patient: { organizationId: orgId },
    },
    include: {
      patient: { select: { firstName: true, lastName: true } },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  return {
    ok: true,
    rows: rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      patientName: `${r.patient.firstName} ${r.patient.lastName}`,
      lastMessageAt: r.lastMessageAt.toISOString(),
      priority: r.triageUrgency,
      category: r.triageCategory,
    })),
  };
}
