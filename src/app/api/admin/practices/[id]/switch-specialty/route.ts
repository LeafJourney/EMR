// POST /api/admin/practices/[id]/switch-specialty
//
// Super-admin only: switches a published PracticeConfiguration's specialty
// to a new manifest. v1 is a SOFT SWITCH — we replace the manifest-derived
// fields (selectedSpecialty, careModel, modalities, workflows, charting,
// shells) but DO NOT touch patient/encounter/note records. Existing data
// from the old modality remains in place; the UI for disabled modalities
// hides on read.
//
// The endpoint expects the practice's CONFIG id (PracticeConfiguration.id),
// not the organization id. This mirrors the wizard's apply-specialty path.
//
// Body: { slug: string, confirmName: string }
//   - confirmName must equal the organization's name (typed-confirmation).
//
// Side effects:
//   1. PracticeConfiguration row updated (status preserved).
//   2. ControllerAuditLog entry written via logControllerAction with
//      action="controller.config.switch_specialty" + before/after snapshots.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { applyTemplateDefaults } from "@/lib/specialty-templates/registry";
import { logControllerAction } from "@/lib/auth/audit-stub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  slug: z.string().min(1).max(100),
  confirmName: z.string().min(1),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const gate = await requireApiAuth({ role: "super_admin" });
  if (gate.error) return gate.error;
  const actor = gate.actor;

  const configId = params.id;
  if (!configId) {
    return NextResponse.json({ error: "missing_config_id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const config = await prisma.practiceConfiguration.findUnique({
    where: { id: configId },
    select: {
      id: true,
      organizationId: true,
      selectedSpecialty: true,
      selectedSpecialtyVersion: true,
      careModel: true,
      enabledModalities: true,
      disabledModalities: true,
      workflowTemplateIds: true,
      chartingTemplateIds: true,
      physicianShellTemplateId: true,
      patientShellTemplateId: true,
      status: true,
      version: true,
    },
  });
  if (!config) {
    return NextResponse.json({ error: "config_not_found" }, { status: 404 });
  }

  if (config.status !== "published") {
    return NextResponse.json(
      { error: "config_not_published", status: config.status },
      { status: 400 },
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: config.organizationId },
    select: { id: true, name: true },
  });
  if (!org) {
    return NextResponse.json({ error: "org_not_found" }, { status: 404 });
  }

  if (parsed.data.confirmName.trim() !== org.name) {
    return NextResponse.json(
      { error: "confirm_name_mismatch", expected: org.name },
      { status: 400 },
    );
  }

  let defaults;
  try {
    defaults = applyTemplateDefaults(parsed.data.slug);
  } catch (err) {
    return NextResponse.json(
      {
        error: "template_unavailable",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  if (!defaults || !defaults.selectedSpecialty) {
    return NextResponse.json(
      { error: "unknown_specialty", slug: parsed.data.slug },
      { status: 404 },
    );
  }

  const before = {
    selectedSpecialty: config.selectedSpecialty,
    selectedSpecialtyVersion: config.selectedSpecialtyVersion,
    careModel: config.careModel,
    enabledModalities: config.enabledModalities,
    disabledModalities: config.disabledModalities,
    workflowTemplateIds: config.workflowTemplateIds,
    chartingTemplateIds: config.chartingTemplateIds,
    physicianShellTemplateId: config.physicianShellTemplateId,
    patientShellTemplateId: config.patientShellTemplateId,
  };

  const updated = await prisma.practiceConfiguration.update({
    where: { id: configId },
    data: {
      selectedSpecialty: defaults.selectedSpecialty ?? null,
      selectedSpecialtyVersion: defaults.selectedSpecialtyVersion ?? null,
      careModel: defaults.careModel ?? null,
      enabledModalities: defaults.enabledModalities ?? [],
      disabledModalities: defaults.disabledModalities ?? [],
      workflowTemplateIds: defaults.workflowTemplateIds ?? [],
      chartingTemplateIds: defaults.chartingTemplateIds ?? [],
      physicianShellTemplateId: defaults.physicianShellTemplateId ?? null,
      patientShellTemplateId: defaults.patientShellTemplateId ?? null,
    },
    select: {
      id: true,
      selectedSpecialty: true,
      selectedSpecialtyVersion: true,
      enabledModalities: true,
      disabledModalities: true,
      status: true,
    },
  });

  await logControllerAction({
    actor: {
      id: actor.id,
      email: actor.email,
      roles: actor.roles,
      organizationId: actor.organizationId,
    },
    action: "controller.config.switch_specialty",
    targetId: configId,
    before,
    after: {
      selectedSpecialty: updated.selectedSpecialty,
      selectedSpecialtyVersion: updated.selectedSpecialtyVersion,
      careModel: defaults.careModel,
      enabledModalities: updated.enabledModalities,
      disabledModalities: updated.disabledModalities,
      workflowTemplateIds: defaults.workflowTemplateIds,
      chartingTemplateIds: defaults.chartingTemplateIds,
      physicianShellTemplateId: defaults.physicianShellTemplateId,
      patientShellTemplateId: defaults.patientShellTemplateId,
    },
    reason: `Soft switch via super-admin console (org: ${org.name})`,
  });

  return NextResponse.json({ ok: true, config: updated });
}
