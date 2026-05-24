"use server";

// EMR-588 — Confidential clinician-only notes.
//
// These are "private provider notes" that live *outside* the patient's
// legal chart: never visible on the patient portal, never included in
// chart-export / records-release packets, never auto-populated by an
// agent (Objective-section rule from Doc 1 extends here — human-author
// only). Use cases per ticket: violent-behavior flags, abusive toward
// staff, safety context the provider needs to remember but should not
// land in the discoverable record.
//
// Storage (v1): we use `AuditLog` rows as the underlying store. Each row
// IS the audit entry — `subjectType = "PrivateClinicianNote"`, `subjectId
// = patientId`, `metadata.body` is the note text. This keeps every
// create/read traceable to a real actor and timestamp without a schema
// migration on the path to legal review.
//
// TODO(EMR-588 follow-up): replace the AuditLog-backed store with a
// dedicated `PrivateClinicianNote` model once Legal signs off on
// retention + discoverability. The model needs: id, patientId,
// organizationId, authorUserId, body, createdAt, deletedAt, plus a
// separate `PrivateClinicianNoteAccessLog` for read-audit. Add to the
// chart-export EXCLUDE list at the same time.

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  ForbiddenError,
  assertChartAccess,
  requirePermission,
} from "@/lib/rbac/permissions";
import { logger } from "@/lib/observability/log";

const SUBJECT_TYPE = "PrivateClinicianNote";
const ACTION_CREATE = "private_note.create";
const ACTION_READ = "private_note.read";

export interface PrivateNote {
  id: string;
  body: string;
  authorName: string;
  createdAt: string; // ISO — server components stringify before rendering
}

/**
 * Load private clinician-only notes for a patient. Throws ForbiddenError
 * when the caller lacks notes.read or fails the chart-privacy gate.
 * Writes a read-audit row on success so we know who pulled the section.
 */
export async function listPrivateNotes(patientId: string): Promise<PrivateNote[]> {
  const user = await requireUser();
  requirePermission(user, "notes.read");
  await assertChartAccess(user, patientId);

  // The store + the audit are the same table — newest first, cap at 200
  // so a chart that's accumulated a decade of safety notes doesn't blow
  // the panel out. (Same cap as the legal notes feed in page.tsx.)
  const rows = await prisma.auditLog.findMany({
    where: {
      organizationId: user.organizationId!,
      subjectType: SUBJECT_TYPE,
      subjectId: patientId,
      action: ACTION_CREATE,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      actor: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  // Read-audit: log that this user pulled the private-notes panel. Fail
  // open — never block the clinician from seeing safety context because
  // the audit insert hiccuped.
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId!,
        actorUserId: user.id,
        action: ACTION_READ,
        subjectType: SUBJECT_TYPE,
        subjectId: patientId,
        metadata: { count: rows.length } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.error({ event: "private_note.read_audit_failed", patientId, err: String(err) });
  }

  return rows.map((row) => {
    const meta = (row.metadata as { body?: unknown } | null) ?? null;
    const body = typeof meta?.body === "string" ? meta.body : "";
    const author = row.actor;
    const authorName = author
      ? [author.firstName, author.lastName].filter(Boolean).join(" ").trim() ||
        author.email
      : "Unknown clinician";
    return {
      id: row.id,
      body,
      authorName,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/**
 * Add a confidential clinician-only note. Requires notes.edit (so
 * read-only back-office can't author), plus chart-privacy access.
 *
 * Per Doc 1 / Doc 3 rule: this entry point is server-action only and
 * accepts a human-typed body — there is no AI fill path here and the
 * client surface never wires up an autofill button.
 */
export async function addPrivateNote(
  patientId: string,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

  try {
    requirePermission(user, "notes.edit");
    await assertChartAccess(user, patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "You don't have permission to add private notes." };
    }
    throw err;
  }

  const trimmed = body?.trim() ?? "";
  if (trimmed.length === 0) {
    return { ok: false, error: "Note can't be empty." };
  }
  if (trimmed.length > 4000) {
    return { ok: false, error: "Note is too long (4000 character cap)." };
  }

  // Confirm the patient is in this org before writing — defense in depth
  // beyond the chart-access gate.
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
    select: { id: true },
  });
  if (!patient) {
    return { ok: false, error: "Patient not found." };
  }

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId!,
      actorUserId: user.id,
      action: ACTION_CREATE,
      subjectType: SUBJECT_TYPE,
      subjectId: patientId,
      metadata: { body: trimmed } as Prisma.InputJsonValue,
    },
  });

  // Revalidate the chart so the new note shows up immediately.
  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}
