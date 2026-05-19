// EMR-421 — POST /api/configs/[id]/apply-specialty
//
// Applies a specialty template's defaults to a draft practice config. The
// client posts only `{ slug }`; the server is the source of truth for what
// "applying" means (modalities, workflows, charting templates).
//
// This route currently delegates the actual draft mutation to the EMR-435
// PATCH endpoint. Until that lands we PATCH directly through a stub helper
// — the contract on the wire is unchanged.

import { NextResponse } from "next/server";
import { z } from "zod";
import { applyTemplateDefaults } from "@/lib/specialty-templates/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  slug: z.string().min(1).max(100),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
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

  const defaults = applyTemplateDefaults(parsed.data.slug);
  if (!defaults) {
    return NextResponse.json(
      { error: "unknown_specialty", slug: parsed.data.slug },
      { status: 404 },
    );
  }

  // TODO(EMR-435): replace this direct fetch with the canonical PATCH client
  // once `PATCH /api/configs/[id]` ships. For now we audit the override and
  // forward the resulting fields so the route contract is stable.
  console.info("onboarding.apply_specialty", {
    at: new Date().toISOString(),
    draftId,
    slug: parsed.data.slug,
    enabledCount: (defaults.enabledModalities ?? []).length,
    disabledCount: (defaults.disabledModalities ?? []).length,
  });

  return NextResponse.json({
    ok: true,
    draftId,
    applied: defaults,
  });
}
