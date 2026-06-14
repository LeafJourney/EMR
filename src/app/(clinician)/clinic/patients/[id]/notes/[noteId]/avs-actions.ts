"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { createLightContext } from "@/lib/orchestration/context";
import { avsGeneratorAgent } from "@/lib/agents/avs-generator-agent";
import { safeParseAvsDocument, type AvsDocument } from "@/lib/domain/avs/types";

// ---------------------------------------------------------------------------
// EMR-1152 — Provider verification + one-click release of the after-visit
// summary. Release is BLOCKED until the provider affirms the summary matches
// the signed note (the `verified` flag); after that it's a single action that
// flips the draft to released and surfaces it in the patient portal.
// ---------------------------------------------------------------------------

export interface AvsSummaryData {
  id: string;
  status: "draft" | "released";
  language: string;
  readabilityGrade: number | null;
  releasedAt: string | null;
  doc: AvsDocument;
}

type LoadResult =
  | { ok: true; summary: AvsSummaryData | null }
  | { ok: false; error: string };

async function loadNoteScoped(noteId: string) {
  const user = await requireUser();
  const note = await prisma.note.findFirst({
    where: { id: noteId, encounter: { organizationId: user.organizationId! } },
    select: { id: true, status: true },
  });
  return { user, note };
}

/** Read the persisted AVS draft/release for a note (org-scoped). */
export async function getAvsForNote(noteId: string): Promise<LoadResult> {
  const { note } = await loadNoteScoped(noteId);
  if (!note) return { ok: false, error: "Note not found" };

  const row = await prisma.afterVisitSummary.findUnique({ where: { noteId } });
  if (!row) return { ok: true, summary: null };

  const doc = safeParseAvsDocument(row.payload);
  if (!doc) return { ok: false, error: "Stored summary is unreadable; regenerate it." };

  return {
    ok: true,
    summary: {
      id: row.id,
      status: row.status,
      language: row.language,
      readabilityGrade: row.readabilityGrade,
      releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
      doc,
    },
  };
}

/** (Re)generate the AVS draft for a signed note via the deterministic agent. */
export async function regenerateAvsForNote(noteId: string): Promise<LoadResult> {
  const { user, note } = await loadNoteScoped(noteId);
  if (!note) return { ok: false, error: "Note not found" };
  if (!hasPermission(user, "notes.edit")) return { ok: false, error: "Not permitted" };

  const ctx = createLightContext({
    organizationId: user.organizationId,
    agentName: "avsGenerator",
  });
  const result = await avsGeneratorAgent.run({ noteId }, ctx);
  if (result.skipped && result.reason === "already_released") {
    return { ok: false, error: "This summary is already released and cannot be regenerated." };
  }
  if (result.skipped) {
    return { ok: false, error: `Could not generate summary (${result.reason ?? "unknown"}).` };
  }

  revalidatePath(`/clinic/patients/${(await currentPatientId(noteId)) ?? ""}/notes/${noteId}`);
  return getAvsForNote(noteId);
}

/**
 * Release the verified AVS to the patient. `verified` must be true — the panel
 * gates the button on the provider's review affirmation.
 */
export async function releaseAvsForNote(
  noteId: string,
  verified: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!hasPermission(user, "notes.edit")) return { ok: false, error: "Not permitted" };
  if (!verified) return { ok: false, error: "Confirm the summary matches your note before releasing." };

  const row = await prisma.afterVisitSummary.findUnique({
    where: { noteId },
    select: { id: true, status: true, organizationId: true, patientId: true },
  });
  if (!row) return { ok: false, error: "No summary to release. Generate one first." };
  if (row.organizationId !== user.organizationId) return { ok: false, error: "Not permitted" };
  if (row.status === "released") return { ok: true };

  const now = new Date();
  await prisma.afterVisitSummary.update({
    where: { id: row.id },
    data: { status: "released", releasedAt: now, releasedById: user.id },
  });

  // Surface it in the patient portal immediately (notification + timeline page).
  const patient = await prisma.patient.findUnique({
    where: { id: row.patientId },
    select: { userId: true },
  });
  if (patient?.userId) {
    await prisma.notification.create({
      data: {
        userId: patient.userId,
        type: "avs_ready",
        priority: "normal",
        title: "Your visit summary is ready",
        body: "Read your plain-language after-visit summary, with your plan and next steps.",
        href: "/portal/visit-summary",
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: row.organizationId,
      actorUserId: user.id,
      action: "avs.released",
      subjectType: "AfterVisitSummary",
      subjectId: row.id,
      metadata: { noteId, patientId: row.patientId },
    },
  });

  revalidatePath("/portal/visit-summary");
  return { ok: true };
}

async function currentPatientId(noteId: string): Promise<string | null> {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: { encounter: { select: { patientId: true } } },
  });
  return note?.encounter.patientId ?? null;
}
