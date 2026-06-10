// EMR-421 — POST /api/configs/[id]/apply-specialty
//
// Applies a specialty template's defaults to a draft practice config. The
// client posts only `{ slug }`; the server is the source of truth for what
// "applying" means (modalities, workflows, charting templates).
//
// The EMR-435 PATCH endpoint has since shipped, so this route now persists the
// applied defaults onto the draft itself (rather than merely echoing them back,
// which left the selected specialty unsaved). Only draft configs can be
// re-seeded — applying a specialty rewrites modalities/templates, which must
// not happen to a published or archived config.

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { applyTemplateDefaults } from "@/lib/specialty-templates/registry";
import { withAdminMutation } from "@/lib/auth/with-admin-mutation";
import { logControllerAction } from "@/lib/auth/audit-stub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  slug: z.string().min(1).max(100),
});

export const POST = withAdminMutation<{ id: string }>(
  { bucket: "admin.config.apply_specialty", role: "implementation_admin" },
  async (req, { actor: admin, params }) => {
  const draftId = params.id;
  if (!draftId) {
    return NextResponse.json({ error: "missing_draft_id" }, { status: 400 });
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

  let defaults: ReturnType<typeof applyTemplateDefaults>;
  try {
    defaults = applyTemplateDefaults(parsed.data.slug);
  } catch (e) {
    // applyTemplateDefaults throws when only deprecated versions of the slug
    // remain — surface that as a 409 rather than a generic 500.
    const message = e instanceof Error ? e.message : String(e);
    if (message.startsWith("DEPRECATED_TEMPLATE")) {
      return NextResponse.json(
        { error: "deprecated_specialty", slug: parsed.data.slug, message },
        { status: 409 },
      );
    }
    throw e;
  }

  // An unknown slug yields an empty seed — there is nothing to apply.
  if (Object.keys(defaults).length === 0) {
    return NextResponse.json(
      { error: "unknown_specialty", slug: parsed.data.slug },
      { status: 404 },
    );
  }

  const existing = await prisma.practiceConfiguration.findUnique({
    where: { id: draftId },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (existing.status !== "draft") {
    return NextResponse.json(
      {
        error: "not_a_draft",
        message: "A specialty can only be applied to a draft configuration.",
        status: existing.status,
      },
      { status: 409 },
    );
  }

  const updated = await prisma.practiceConfiguration.update({
    where: { id: draftId },
    data: defaults as Prisma.PracticeConfigurationUpdateInput,
  });

  await logControllerAction({
    actor: admin,
    action: "controller.config.apply_specialty",
    targetId: updated.id,
    after: {
      slug: parsed.data.slug,
      version: defaults.selectedSpecialtyVersion ?? null,
      enabledModalities: defaults.enabledModalities ?? [],
      disabledModalities: defaults.disabledModalities ?? [],
    },
  });

  return NextResponse.json({
    ok: true,
    draftId,
    applied: defaults,
    config: updated,
  });
  },
);
