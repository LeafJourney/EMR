// SAFE: dead-export-allowed reason="EMR-917 Tier-3 persistence; the assessments-page override control is a later slice in the build sequence"
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { assertChartAccess } from "@/lib/rbac/permissions";

// EMR-917 — clinician sets/clears a Tier-3 per-patient assessment override
// (require / skip / not_applicable). This records clinical INTENT for one
// patient + one assessment; the pure rules engine applies it. Authorization is
// chart access for this patient in the clinician's org (assertChartAccess) — the
// same bar as viewing the chart, since an override is a clinical annotation.

export type OverrideResult = { ok: true } | { ok: false; error: string };

const setSchema = z.object({
  patientId: z.string().min(1),
  assessmentSlug: z.string().min(1).max(80),
  override: z.enum(["require", "skip", "not_applicable"]),
  reason: z.string().max(500).optional().nullable(),
});

export async function setAssessmentOverride(
  _prev: OverrideResult | null,
  formData: FormData,
): Promise<OverrideResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No clinic affiliation on file." };

  const parsed = setSchema.safeParse({
    patientId: formData.get("patientId"),
    assessmentSlug: formData.get("assessmentSlug"),
    override: formData.get("override"),
    reason: formData.get("reason") || null,
  });
  if (!parsed.success) return { ok: false, error: "Missing or malformed input." };
  const { patientId, assessmentSlug, override, reason } = parsed.data;

  try {
    await assertChartAccess(user, patientId);
  } catch {
    return { ok: false, error: "You don't have access to this patient's chart." };
  }

  await prisma.patientAssessmentOverride.upsert({
    where: { patientId_assessmentSlug: { patientId, assessmentSlug } },
    update: { override, reason: reason ?? null, setByUserId: user.id, organizationId: user.organizationId },
    create: {
      patientId,
      organizationId: user.organizationId,
      assessmentSlug,
      override,
      reason: reason ?? null,
      setByUserId: user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "assessment.override.set",
      subjectType: "Patient",
      subjectId: patientId,
      // PHI-free: the assessment slug + the declared override, no patient data.
      metadata: { assessmentSlug, override },
    },
  });

  revalidatePath(`/clinic/patients/${patientId}/assessments`);
  return { ok: true };
}

export async function clearAssessmentOverride(
  patientId: string,
  assessmentSlug: string,
): Promise<OverrideResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No clinic affiliation on file." };

  try {
    await assertChartAccess(user, patientId);
  } catch {
    return { ok: false, error: "You don't have access to this patient's chart." };
  }

  // Org-scoped delete so a clinician can only clear overrides in their own org.
  const res = await prisma.patientAssessmentOverride.deleteMany({
    where: { patientId, assessmentSlug, organizationId: user.organizationId },
  });

  if (res.count > 0) {
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "assessment.override.cleared",
        subjectType: "Patient",
        subjectId: patientId,
        metadata: { assessmentSlug },
      },
    });
  }

  revalidatePath(`/clinic/patients/${patientId}/assessments`);
  return { ok: true };
}
