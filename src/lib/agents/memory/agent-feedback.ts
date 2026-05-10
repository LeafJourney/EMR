/**
 * Agent Feedback — the learning loop.
 *
 * Every time a physician interacts with an agent output (approve, edit,
 * reject, dismiss), we capture that as a structured feedback row. Over
 * time these rows tell us which agents are earning their keep and which
 * aren't — the single strongest signal for improving the fleet.
 *
 * Writes MUST be idempotent-safe and non-blocking. A failure to record
 * feedback should never stop the approval action from committing; the
 * patient's care comes first, the learning loop comes second.
 */

import { prisma } from "@/lib/db/prisma";
import type { AgentFeedback, FeedbackAction } from "@prisma/client";
import { logger } from "@/lib/observability/log";

export interface RecordFeedbackInput {
  agentName: string;
  agentVersion?: string;
  organizationId?: string | null;
  agentJobId?: string | null;
  messageId?: string | null;
  noteId?: string | null;
  action: FeedbackAction;
  reviewerId: string;
  /** Only provided for approved_with_edits. */
  editDelta?: string | null;
  reviewerNote?: string | null;
}

export async function recordFeedback(
  input: RecordFeedbackInput,
): Promise<AgentFeedback | null> {
  try {
    return await prisma.agentFeedback.create({
      data: {
        agentName: input.agentName,
        agentVersion: input.agentVersion ?? null,
        organizationId: input.organizationId ?? null,
        agentJobId: input.agentJobId ?? null,
        messageId: input.messageId ?? null,
        noteId: input.noteId ?? null,
        action: input.action,
        reviewerId: input.reviewerId,
        editDelta: input.editDelta ?? null,
        reviewerNote: input.reviewerNote ?? null,
      },
    });
  } catch (err) {
    logger.warn({
      event: "agent.feedback.persist_failed",
      agentName: input.agentName,
      action: input.action,
      err,
    });
    return null;
  }
}

/**
 * Aggregate feedback for a single agent, broken down by action type.
 * This is the backbone of the "how is this agent doing?" view.
 */
export interface AgentFeedbackStats {
  agentName: string;
  total: number;
  approved: number;
  approvedWithEdits: number;
  rejected: number;
  dismissed: number;
  /** Ratio of approved (with or without edits) over total. */
  approvalRate: number;
  /** Ratio of approved-clean (no edits) over total. */
  cleanApprovalRate: number;
}

export async function getAgentFeedbackStats(
  agentName: string,
  window?: { since?: Date; until?: Date },
): Promise<AgentFeedbackStats> {
  const where: any = { agentName };
  if (window?.since || window?.until) {
    where.createdAt = {};
    if (window.since) where.createdAt.gte = window.since;
    if (window.until) where.createdAt.lte = window.until;
  }
  const rows = await prisma.agentFeedback.findMany({
    where,
    select: { action: true },
  });
  const counts = {
    approved: 0,
    approved_with_edits: 0,
    rejected: 0,
    dismissed: 0,
  };
  for (const r of rows) counts[r.action]++;
  const total = rows.length;
  const approvedAny = counts.approved + counts.approved_with_edits;
  return {
    agentName,
    total,
    approved: counts.approved,
    approvedWithEdits: counts.approved_with_edits,
    rejected: counts.rejected,
    dismissed: counts.dismissed,
    approvalRate: total > 0 ? approvedAny / total : 0,
    cleanApprovalRate: total > 0 ? counts.approved / total : 0,
  };
}

/**
 * Compute a lightweight character-level diff between two strings. We
 * don't need a real diff library — we just want to capture how much the
 * physician changed, for trend tracking over time.
 */
export function computeEditDelta(original: string, edited: string): string {
  if (original === edited) return "";
  const delta =
    `[${Math.abs(edited.length - original.length)} char${Math.abs(edited.length - original.length) === 1 ? "" : "s"} ` +
    (edited.length > original.length ? "added" : "removed") +
    `] ${edited.slice(0, 400)}${edited.length > 400 ? "…" : ""}`;
  return delta;
}
