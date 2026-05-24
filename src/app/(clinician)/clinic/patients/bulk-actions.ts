"use server";

/**
 * Bulk server actions for the patient roster (/clinic/patients).
 *
 * Each action takes an array of patient IDs and applies the same op
 * inside a single Prisma transaction so the surface either applies the
 * full batch or fails atomically — partial-state bulk archives have
 * tripped clinicians more than once in older EMRs (status drift becomes
 * an audit nightmare).
 *
 * Where a single-item action already exists (e.g. archive lives behind
 * a patient detail mutation today), we wrap it in `bulk*` here. Where
 * the single-item action doesn't exist yet (broadcast send, tag), we
 * stub a placeholder that throws "not implemented" with a TODO ticket
 * reference so the bar wiring can ship now and the backend can light
 * up incrementally.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";

const patientIdsSchema = z.object({
  patientIds: z.array(z.string().min(1)).min(1).max(500),
});

type BulkResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

// ---------------------------------------------------------------- archive

/**
 * Archive a batch of patient charts in one transaction. Sets status to
 * `archived` and stamps `deletedAt` for soft-delete continuity with the
 * rest of the chart code (the list query already filters `deletedAt`).
 *
 * Destructive — the calling UI is expected to gate this behind a confirm
 * dialog (see `BulkArchiveConfirm` in patient-list-client.tsx).
 */
export async function bulkArchivePatientsAction(
  input: z.infer<typeof patientIdsSchema>,
): Promise<BulkResult> {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const parsed = patientIdsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid patient selection." };
  }

  const ids = parsed.data.patientIds;

  // Tenant guard — only update patients that belong to this org. The
  // updateMany filters on organizationId so a malicious id from another
  // org is silently skipped (and counted as not-updated).
  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.patient.updateMany({
      where: {
        id: { in: ids },
        organizationId: orgId,
        deletedAt: null,
      },
      data: {
        status: "archived",
        deletedAt: now,
      },
    });

    // Audit trail — one row per archived patient so the log preserves
    // the granularity an org would want for compliance retrieval.
    if (updated.count > 0) {
      await tx.auditLog.createMany({
        data: ids.map((id) => ({
          organizationId: orgId,
          actorUserId: user.id,
          action: "patient.bulk_archived",
          subjectType: "Patient",
          subjectId: id,
          metadata: { batchSize: ids.length } as object,
        })),
      });
    }
    return updated.count;
  });

  revalidatePath("/clinic/patients");
  return { ok: true, count: result };
}

// ----------------------------------------------------------------- export

/**
 * Bulk export selected patients to CSV. The actual CSV streams to the
 * browser via the existing /api/admin/patients/export route when one
 * lands; for now we return the rows to the client so it can build the
 * Blob locally. Non-destructive — runs immediately, toast confirms.
 */
export async function bulkExportPatientsAction(
  input: z.infer<typeof patientIdsSchema>,
): Promise<
  | {
      ok: true;
      rows: Array<{
        id: string;
        firstName: string;
        lastName: string;
        dob: string | null;
        email: string | null;
        phone: string | null;
        status: string;
        lastVisit: string | null;
      }>;
    }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const parsed = patientIdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid patient selection." };

  const patients = await prisma.patient.findMany({
    where: {
      id: { in: parsed.data.patientIds },
      organizationId: orgId,
      deletedAt: null,
    },
    include: {
      appointments: {
        where: { status: "confirmed" },
        orderBy: { startAt: "desc" },
        take: 1,
      },
    },
  });

  return {
    ok: true,
    rows: patients.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      dob: p.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      email: p.email,
      phone: p.phone,
      status: p.status,
      lastVisit: p.appointments[0]?.startAt?.toISOString() ?? null,
    })),
  };
}

// ------------------------------------------------------- broadcast (stub)

/**
 * Send a broadcast SMS/email to a bulk patient selection.
 *
 * TODO(EMR-707) — wire to the broadcast-campaign infra. PR #460 adoption
 * brings the UX in line with the rest of the bar; the campaign run /
 * cost preview / quiet-hours gate needs to land separately. Throws so
 * the bar surfaces the failure as a toast and the operator can route
 * through /admin/broadcasts manually in the interim.
 */
export async function bulkBroadcastPatientsAction(
  _input: z.infer<typeof patientIdsSchema>,
): Promise<BulkResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Unauthorized." };
  // Intentional placeholder — explicit error so the calling surface
  // surfaces a "not yet wired" toast rather than silently no-op'ing.
  return {
    ok: false,
    error:
      "Bulk broadcast is not yet wired up. Use /clinic/broadcasts/new to compose a campaign for these patients (EMR-707).",
  };
}

// ------------------------------------------------------------- tag (stub)

/**
 * Apply a tag to a bulk patient selection.
 *
 * Patient tags live in localStorage today (see patient-tag-badge.tsx) —
 * the server side is on the roadmap as part of the saved-views work in
 * EMR-684. For now the bar runs a client-side tag write; the server
 * action exists to keep the action shape uniform for when the model
 * lands.
 */
export async function bulkTagPatientsAction(input: {
  patientIds: string[];
  tagId: string;
}): Promise<BulkResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Unauthorized." };
  if (!input.patientIds.length) {
    return { ok: false, error: "No patients selected." };
  }
  // TODO(EMR-684) — persist tags to the PatientTag table once it lands.
  return {
    ok: false,
    error: "Server-side patient tags ship in EMR-684; tag has been applied locally only.",
  };
}
