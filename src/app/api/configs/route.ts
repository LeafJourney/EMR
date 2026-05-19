// EMR-435 — Configuration CRUD API
// POST /api/configs — create a draft PracticeConfiguration for
// { organizationId, practiceId }. Returns the new row.
//
// All endpoints under /api/configs (except by-practice/[practiceId]) require
// Implementation Admin. See ticket scope notes in branch description.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import { logControllerAction } from "@/lib/auth/audit-stub";
// TODO(EMR-408): integrate `applyTemplateDefaults` once
// src/lib/specialty-templates/registry.ts lands.
import { applyTemplateDefaults } from "@/lib/specialty-templates/registry";
import {
  readJson,
  invalidInput,
  withAuthErrors,
} from "./_helpers";

export const runtime = "nodejs";

const createDraftInput = z.object({
  organizationId: z.string().min(1).optional(),
  practiceId: z.string().min(1).optional(),
  // Optional specialty seed — when present we fan out template defaults via
  // EMR-408. NOT required at draft creation time; the wizard can pick a
  // specialty later (it's required at publish-time, validated by the publish
  // handler).
  selectedSpecialty: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  return (await withAuthErrors(async () => {
    const admin = await requireImplementationAdmin();

    const parsedBody = await readJson(req);
    if (!parsedBody.ok) return parsedBody.response;

    const parsed = createDraftInput.safeParse(parsedBody.body);
    if (!parsed.success) return invalidInput(parsed.error);

    const { organizationId, practiceId, selectedSpecialty } = parsed.data;
    
    const finalOrgId = organizationId || admin.organizationId || "pending";
    const finalPracticeId = practiceId || "pending";

    // If a specialty was provided up front, seed the draft with the template
    // defaults from the EMR-408 registry. Otherwise we create an empty draft
    // and let the wizard fill it in later.
    const seed = selectedSpecialty
      ? applyTemplateDefaults(selectedSpecialty)
      : {};

    const created = await prisma.practiceConfiguration.create({
      data: {
        organizationId: finalOrgId,
        practiceId: finalPracticeId,
        status: "draft",
        selectedSpecialty: selectedSpecialty ?? null,
        // EMR-431: anchor the draft to the manifest version the registry
        // resolved at create time, so a subsequent publish records the same
        // (slug, version) pair the wizard saw.
        selectedSpecialtyVersion: seed.selectedSpecialtyVersion ?? null,
        careModel: seed.careModel ?? null,
        enabledModalities: seed.enabledModalities ?? [],
        disabledModalities: seed.disabledModalities ?? [],
        workflowTemplateIds: seed.workflowTemplateIds ?? [],
        chartingTemplateIds: seed.chartingTemplateIds ?? [],
        physicianShellTemplateId: seed.physicianShellTemplateId ?? null,
        patientShellTemplateId: seed.patientShellTemplateId ?? null,
      },
    });

    await logControllerAction({
      actor: admin,
      action: "controller.config.draft_created",
      targetId: created.id,
      after: { organizationId: finalOrgId, practiceId: finalPracticeId, selectedSpecialty: selectedSpecialty ?? null },
    });

    return NextResponse.json(created, { status: 201 });
  })) as NextResponse;
}
