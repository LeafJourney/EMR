"use server";

/**
 * Bulk server actions for the audit-log surface (/admin/audit).
 *
 * The audit table is append-only by policy (see `append-only.sql` referenced
 * in the ControllerAuditLog model). That precludes the obvious "set
 * reviewedAt" UPDATE — so "Mark reviewed" instead writes a NEW row of type
 * `audit.reviewed` whose metadata captures the set of original IDs the
 * operator just signed off on. The chronological log gains a verifiable
 * record of who reviewed which incident batch and when, without mutating
 * the original rows. PR-followup (EMR-747+) will surface "reviewed by"
 * inline in the audit table once the indexer reads those rollup rows.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";

const idsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  note: z.string().max(500).optional(),
});

type BulkResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

// ----------------------------------------------------- mark-as-reviewed

export async function bulkMarkAuditReviewedAction(
  input: z.infer<typeof idsSchema>,
): Promise<BulkResult> {
  const user = await requireUser();
  if (!user.roles.includes("super_admin")) {
    return { ok: false, error: "Super-admin role required." };
  }

  const parsed = idsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid selection." };

  // One rollup row per review action — the original IDs land in metadata
  // so a downstream reviewer can replay the batch. We deliberately don't
  // fan this out one-row-per-id; that would 50x the audit volume for
  // routine sweeps.
  await prisma.controllerAuditLog.create({
    data: {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRoles: user.roles,
      organizationId: user.organizationId ?? null,
      action: "audit.reviewed",
      subjectType: "controller",
      subjectId: parsed.data.ids[0], // first id is the "anchor" subject
      after: {
        reviewedIds: parsed.data.ids,
        batchSize: parsed.data.ids.length,
      } as object,
      reason: parsed.data.note ?? null,
    },
  });

  revalidatePath("/admin/audit");
  return { ok: true, count: parsed.data.ids.length };
}

// ---------------------------------------------------------------- export

/**
 * Build a CSV-friendly payload from a fixed selection of audit rows.
 * The existing /api/admin/audit/export endpoint exports the *filter
 * result set*; this action exports a hand-picked sub-selection, which
 * is what the bar's "Export selected" affordance promises.
 *
 * Returns the rows; the client renders them into a Blob locally so we
 * don't need a streaming endpoint just for ad-hoc sub-selections.
 */
export async function bulkExportAuditRowsAction(input: {
  ids: string[];
}): Promise<
  | {
      ok: true;
      rows: Array<{
        id: string;
        at: string;
        actor: string;
        action: string;
        subjectType: string;
        subjectId: string;
        organization: string | null;
        reason: string | null;
      }>;
    }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  if (!user.roles.includes("super_admin")) {
    return { ok: false, error: "Super-admin role required." };
  }
  if (!input.ids?.length) return { ok: false, error: "No rows selected." };

  const rows = await prisma.controllerAuditLog.findMany({
    where: { id: { in: input.ids } },
    orderBy: { at: "desc" },
  });

  return {
    ok: true,
    rows: rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      actor: r.actorEmail ?? r.actorUserId,
      action: r.action,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      organization: r.organizationId,
      reason: r.reason,
    })),
  };
}
