"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { dispatch } from "@/lib/orchestration/dispatch";
import { logger } from "@/lib/observability/log";
import {
  ForbiddenError,
  assertChartAccess,
  hasPermission,
  requirePermission,
} from "@/lib/rbac/permissions";

/**
 * Start a visit: find or create an in-progress encounter for today,
 * dispatch the scribe draft event, attempt a quick inline run with a
 * timeout, and redirect to notes immediately.
 */
export async function startVisit(patientId: string) {
  const user = await requireUser();

  // EMR-786 — Starting a visit requires write access to clinical notes.
  // Front-office and back-office staff hit the deny path; mid-levels +
  // clinicians + practice_owners pass.
  if (!hasPermission(user, "notes.edit")) {
    redirect(`/clinic/patients/${patientId}?tab=notes&error=unauthorized`);
  }

  // EMR-786 — Chart-privacy gate. A doctor-only chart that the current
  // user is not on the allowlist for must reject the start-visit, even
  // for clinicians who would otherwise have notes.edit globally.
  try {
    await assertChartAccess(user, patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      redirect(`/clinic/patients/${patientId}?tab=notes&error=restricted`);
    }
    throw err;
  }

  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });
  if (!patient) {
    redirect(`/clinic/patients/${patientId}?tab=notes&error=not_found`);
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  let encounter = await prisma.encounter.findFirst({
    where: {
      patientId,
      organizationId: user.organizationId!,
      status: "in_progress",
      createdAt: { gte: todayStart, lte: todayEnd },
    },
  });

  if (!encounter) {
    encounter = await prisma.encounter.create({
      data: {
        organizationId: user.organizationId!,
        patientId,
        status: "in_progress",
        modality: "in_person",
        reason: "Visit",
        startedAt: new Date(),
        scheduledFor: new Date(),
      },
    });
  }

  // Dispatch the scribe event — this enqueues the job
  const jobs = await dispatch({
    name: "encounter.note.draft.requested",
    encounterId: encounter.id,
    requestedBy: user.id,
  });

  // Try to run the agent inline with a 15-second timeout.
  // By running the specific job(s) returned by dispatch, we avoid
  // inadvertently pulling unrelated backlogged jobs from the queue.
  try {
    if (jobs.length > 0) {
      const jobRows = await prisma.agentJob.findMany({ where: { id: { in: jobs } } });
      const { runJob } = await import("@/lib/orchestration/runner");
      
      await Promise.race([
        Promise.all(jobRows.map(job => runJob(job, "inline-visit"))),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 15000)
        ),
      ]);
    }
  } catch (err) {
    // Timeout or error — the job is still in the queue.
    logger.error({ event: "clinic.start_visit.inline_failed", err });
  }

  // Query for the note the scribe just created (if any) and redirect
  // directly to it. If none exists yet, fall back to the notes tab
  // with a message so the clinician knows the scribe is processing.
  const latestNote = await prisma.note.findFirst({
    where: { encounterId: encounter.id },
    orderBy: { createdAt: "desc" },
  });

  revalidatePath(`/clinic/patients/${patientId}`);

  if (latestNote) {
    redirect(`/clinic/patients/${patientId}/notes/${latestNote.id}`);
  } else {
    redirect(`/clinic/patients/${patientId}?tab=notes&scribe=processing`);
  }
}

/* ── EMR-786 — Chart privacy management ────────────────────────── */

export type ChartPrivacyResult =
  | { ok: true; chartRestricted: boolean }
  | { ok: false; error: string };

/**
 * Toggle the doctor-only flag on a chart and set the allowlist of
 * provider User IDs who may view the restricted chart. Only users with
 * `chart.privacy.manage` (clinician / practice_owner) may call this —
 * patients flag their preference via a different intake path that
 * surfaces a Task for the clinician to acknowledge before the flag is
 * set, so this action is always intentional clinician-side.
 *
 * Writes an AuditLog row per repo rule schema.prisma:6.
 */
export async function updateChartPrivacy(input: {
  patientId: string;
  chartRestricted: boolean;
  restrictedProviderIds: string[];
  reason?: string;
}): Promise<ChartPrivacyResult> {
  const user = await requireUser();

  try {
    requirePermission(user, "chart.privacy.manage");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "FORBIDDEN" };
    }
    throw err;
  }

  const patient = await prisma.patient.findFirst({
    where: {
      id: input.patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!patient) return { ok: false, error: "NOT_FOUND" };

  // Ensure the user setting the restriction is themselves on the
  // allowlist — otherwise they'd lock themselves out on the next page
  // load. (Practice owners bypass via PRIVACY_BYPASS_ROLES, but the
  // explicit allowlist entry keeps the audit trail honest.)
  const allowlist = Array.from(
    new Set(
      input.chartRestricted
        ? [...input.restrictedProviderIds, user.id]
        : input.restrictedProviderIds,
    ),
  );

  await prisma.patient.update({
    where: { id: patient.id },
    data: {
      chartRestricted: input.chartRestricted,
      restrictedProviderIds: allowlist,
      chartRestrictedReason: input.reason ?? null,
      chartRestrictedAt: input.chartRestricted ? new Date() : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId!,
      actorUserId: user.id,
      action: input.chartRestricted
        ? "patient.chart.privacy.restricted"
        : "patient.chart.privacy.opened",
      subjectType: "Patient",
      subjectId: patient.id,
      metadata: {
        allowlistSize: allowlist.length,
        reason: input.reason ?? null,
      } as any,
    },
  });

  revalidatePath(`/clinic/patients/${input.patientId}`);
  return { ok: true, chartRestricted: input.chartRestricted };
}
