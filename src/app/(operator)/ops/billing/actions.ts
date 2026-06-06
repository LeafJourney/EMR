"use server";

/**
 * Server actions for /ops/billing.
 *
 * EMR-980 — "Take action" on a denied claim. When a biller responds to,
 * refutes, or adjusts a denied claim we:
 *   1. simulate the outbound action (no real clearinghouse call in V1),
 *   2. write an append-only AuditLog row attributing the action, and
 *   3. post a note into the patient's chart Correspondence tab by
 *      creating/appending a MessageThread + Message (the same models the
 *      clinic correspondence-tab reads), so the action is visible to the
 *      care team alongside everything else for that patient.
 *
 * The correspondence write mirrors src/app/(clinician)/clinic/patients/[id]/
 * correspondence-actions.ts (Message status "sent", bump lastMessageAt) but
 * lives here so we never edit clinic files.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";

const ACTION_TYPES = ["respond", "refute", "adjust"] as const;
type DenialActionType = (typeof ACTION_TYPES)[number];

const ACTION_VERB: Record<DenialActionType, string> = {
  respond: "Responded to",
  refute: "Refuted",
  adjust: "Adjusted",
};

const takeActionSchema = z.object({
  claimId: z.string().min(1),
  actionType: z.enum(ACTION_TYPES),
  department: z.string().min(1).max(120),
  justification: z.string().min(1).max(5000),
});

export type TakeActionResult =
  | { ok: true; threadId: string; message: string }
  | { ok: false; error: string };

/**
 * EMR-980 — record a biller action against a denied claim, write an audit
 * entry, and drop a correspondence note into the patient's chart.
 */
export async function takeDenialAction(
  _prev: TakeActionResult | null,
  formData: FormData,
): Promise<TakeActionResult> {
  const user = await requireUser();
  const organizationId = user.organizationId;
  if (!organizationId) return { ok: false, error: "No organization in session." };

  const parsed = takeActionSchema.safeParse({
    claimId: formData.get("claimId"),
    actionType: formData.get("actionType"),
    department: (formData.get("department") as string)?.trim(),
    justification: (formData.get("justification") as string)?.trim(),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const { claimId, actionType, department, justification } = parsed.data;

  // Verify the claim belongs to this org and grab the patient context.
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, organizationId },
    select: {
      id: true,
      payerName: true,
      denialReason: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!claim) return { ok: false, error: "Claim not found." };

  const now = new Date();
  const verb = ACTION_VERB[actionType];
  const payer = claim.payerName ?? "the payer";

  // Plain-language note posted into the patient's Correspondence tab.
  const noteBody = [
    `Billing — ${verb} a denied claim with ${payer}.`,
    `Routed to: ${department}.`,
    claim.denialReason ? `Denial reason: ${claim.denialReason}.` : null,
    `Justification: ${justification}`,
  ]
    .filter(Boolean)
    .join("\n");

  const subject = `Billing action — claim ${claim.id.slice(0, 8)}`;

  // Reuse an existing billing thread for this patient if one is open, else
  // create a fresh one. Match on the subject prefix we own so we never
  // collide with clinical threads.
  const existing = await prisma.messageThread.findFirst({
    where: {
      patientId: claim.patient.id,
      subject: { startsWith: "Billing action —" },
    },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });

  let threadId: string;
  if (existing) {
    threadId = existing.id;
    await prisma.$transaction([
      prisma.message.create({
        data: {
          threadId,
          senderUserId: user.id,
          status: "sent",
          body: noteBody,
          sentAt: now,
        },
      }),
      prisma.messageThread.update({
        where: { id: threadId },
        data: { lastMessageAt: now },
      }),
    ]);
  } else {
    const thread = await prisma.messageThread.create({
      data: {
        patientId: claim.patient.id,
        subject,
        lastMessageAt: now,
        triageCategory: "billing_question",
        messages: {
          create: {
            senderUserId: user.id,
            status: "sent",
            body: noteBody,
            sentAt: now,
          },
        },
      },
      select: { id: true },
    });
    threadId = thread.id;
  }

  // Append-only audit entry attributing the action to the actor.
  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId: user.id,
      action: `billing.denial.${actionType}`,
      subjectType: "Claim",
      subjectId: claim.id,
      metadata: {
        actionType,
        department,
        justification,
        payerName: claim.payerName,
        patientId: claim.patient.id,
        correspondenceThreadId: threadId,
        simulatedOutbound: true,
      },
    },
  });

  revalidatePath("/ops/billing");

  return {
    ok: true,
    threadId,
    message: `${verb} the claim and routed to ${department}. A note was added to ${claim.patient.firstName} ${claim.patient.lastName}'s chart.`,
  };
}
