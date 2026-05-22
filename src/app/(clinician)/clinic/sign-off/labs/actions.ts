"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { summarizeLabResult } from "@/lib/agents/lab-summarizer-agent";
import { prisma } from "@/lib/db/prisma";

// MALLIK-006 — Lab Review server actions

export type LabDraftsResult =
  | {
      ok: true;
      outreachId: string;
      patientDraft: string;
      maDraft: string;
      physicianNote: string;
    }
  | { ok: false; error: string };

/**
 * "Looks good" — generate AI-drafted outreach text for a reviewed lab.
 * The clinician sees the three drafts in the overlay, edits if needed,
 * then approves (signs) in a separate action.
 */
export async function draftLabOutreachAction(
  labResultId: string
): Promise<LabDraftsResult> {
  const user = await requireUser();

  // Authorize — the lab must belong to the clinician's org.
  const lab = await prisma.labResult.findUnique({
    where: { id: labResultId },
    select: { organizationId: true, signedAt: true, abnormalFlag: true },
  });
  if (!lab) return { ok: false, error: "Lab not found." };
  if (lab.organizationId !== user.organizationId) {
    return { ok: false, error: "Forbidden." };
  }
  if (lab.signedAt) {
    return { ok: false, error: "This lab is already signed." };
  }

  try {
    const drafts = await summarizeLabResult(labResultId);
    revalidatePath("/clinic/labs-review");
    return { ok: true, ...drafts };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to draft outreach. Please try again.",
    };
  }
}

/**
 * Save edits the clinician made to any of the three drafts. Called on blur
 * so the overlay always has the latest text even if the clinician closes it
 * without signing.
 */
export async function updateLabOutreachAction(
  outreachId: string,
  patch: { patientDraft?: string; maDraft?: string; physicianNote?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const out = await prisma.labOutreach.findUnique({
    where: { id: outreachId },
    include: { labResult: { select: { organizationId: true } } },
  });
  if (!out) return { ok: false, error: "Outreach not found." };
  if (out.labResult.organizationId !== user.organizationId) {
    return { ok: false, error: "Forbidden." };
  }
  await prisma.labOutreach.update({
    where: { id: outreachId },
    data: {
      ...(patch.patientDraft !== undefined ? { patientDraft: patch.patientDraft } : {}),
      ...(patch.maDraft !== undefined ? { maDraft: patch.maDraft } : {}),
      ...(patch.physicianNote !== undefined ? { physicianNote: patch.physicianNote } : {}),
    },
  });
  return { ok: true };
}

export type SignResult =
  | { ok: true; signed: number; skipped: Array<{ id: string; reason: string }> }
  | { ok: false; error: string };

/**
 * Sign a single lab result. Writes signedAt/signedById on the lab, bumps
 * the outreach to "approved" if one exists, and drops an AuditLog row.
 * The "Send" part of "Sign & Send" is stubbed until Phase 3 delivery
 * integrations ship — for now we mark the outreach approved and the
 * downstream worker (or a human MA) routes it to the patient.
 */
export async function signLabResultAction(
  labResultId: string
): Promise<SignResult> {
  return signLabs([labResultId]);
}

/**
 * Batch-sign a list of labs. Abnormal labs are silently skipped and
 * reported back in `skipped` — per MALLIK-006 rule #4, abnormals can
 * never enter the batch lane. Signing is atomic per-item: one failure
 * does not halt the rest.
 */
export async function batchSignLabResultsAction(
  labResultIds: string[]
): Promise<SignResult> {
  if (labResultIds.length === 0) {
    return { ok: false, error: "Nothing selected." };
  }
  return signLabs(labResultIds);
}

async function signLabs(labResultIds: string[]): Promise<SignResult> {
  const user = await requireUser();

  const labs = await prisma.labResult.findMany({
    where: {
      id: { in: labResultIds },
      organizationId: user.organizationId ?? "__no_org__",
    },
    select: {
      id: true,
      organizationId: true,
      abnormalFlag: true,
      signedAt: true,
      panelName: true,
      outreach: { select: { id: true } },
    },
  });

  const skipped: Array<{ id: string; reason: string }> = [];
  let signed = 0;

  for (const lab of labs) {
    if (lab.signedAt) {
      skipped.push({ id: lab.id, reason: "already signed" });
      continue;
    }
    // Batch lane excludes abnormals, but single-lab sign-off can still
    // go through (clinician is actively reviewing it in the overlay).
    // The UI enforces the abnormal-in-batch block; this server-side
    // gate only protects against multi-item calls from a malicious client.
    if (lab.abnormalFlag && labResultIds.length > 1) {
      skipped.push({
        id: lab.id,
        reason: "abnormal lab cannot be batch-signed — review individually",
      });
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.labResult.update({
          where: { id: lab.id },
          data: {
            signedById: user.id,
            signedAt: new Date(),
            reviewOutcome: "looks_good",
          },
        });
        if (lab.outreach) {
          await tx.labOutreach.update({
            where: { id: lab.outreach.id },
            data: {
              status: "approved",
              approvedById: user.id,
              approvedAt: new Date(),
            },
          });
        }
      });

      await prisma.auditLog.create({
        data: {
          organizationId: lab.organizationId,
          actorUserId: user.id,
          action: "labResult.signed",
          subjectType: "LabResult",
          subjectId: lab.id,
          metadata: {
            panelName: lab.panelName,
            abnormal: lab.abnormalFlag,
            batchSize: labResultIds.length,
          },
        },
      });
      signed += 1;
    } catch (err) {
      skipped.push({
        id: lab.id,
        reason: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  revalidatePath("/clinic/labs-review");
  return { ok: true, signed, skipped };
}
