// EMR-435 — Configuration CRUD API
// POST /api/configs/[id]/publish
//
// Validates required fields (`selectedSpecialty`, `careModel`, at least one
// enabled modality), snapshots the row into `PracticeConfigurationVersion`,
// increments `version`, flips `status` → 'published', sets publishedAt /
// publishedBy, and revalidates the by-practice cache tag.

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import { logControllerAction } from "@/lib/auth/audit-stub";
import { getSpecialtyTemplate } from "@/lib/specialty-templates/registry";
import { withAuthErrors, notFound } from "../../_helpers";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

/**
 * Required fields for publish. Specialty-adaptive — we never special-case a
 * specific slug here. `enabledModalities` may be empty for some specialties
 * but the ticket requires at least one enabled modality at publish time.
 */
function findMissing(
  config: Record<string, unknown>,
): string[] {
  const missing: string[] = [];

  if (!config.selectedSpecialty) missing.push("selectedSpecialty");
  if (!config.careModel) missing.push("careModel");

  const settings = (config.settings ?? {}) as Record<string, unknown>;
  const enabled = (settings.enabledModalities ??
    (config as Record<string, unknown>).enabledModalities) as
    | unknown[]
    | undefined;

  if (!Array.isArray(enabled) || enabled.length === 0) {
    missing.push("enabledModalities");
  }

  return missing;
}

export async function POST(_req: Request, { params }: Ctx) {
  return (await withAuthErrors(async () => {
    const admin = await requireImplementationAdmin();

    const config = await prisma.practiceConfiguration.findUnique({
      where: { id: params.id },
    });
    if (!config) return notFound();

    const missing = findMissing(config as unknown as Record<string, unknown>);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "conflict", missing },
        { status: 409 },
      );
    }

    const nextVersion = (config.version ?? 0) + 1;
    const publishedAt = new Date();

    // EMR-431 — record the manifest version this practice was published
    // against. We resolve the LATEST manifest for the configured specialty
    // at publish time and persist it on the row. Subsequent template edits
    // (which ship as new manifest versions) do NOT silently re-render this
    // practice — runtime renderers look up the manifest via
    // `getSpecialtyTemplate(selectedSpecialty, selectedSpecialtyVersion)`.
    //
    // If the draft already carries a `selectedSpecialtyVersion` (e.g. set by
    // apply-specialty), we honour it. Otherwise we resolve fresh from the
    // registry. We tolerate a missing manifest (null) — the row publishes
    // with a null version and the runtime falls back to "latest" rendering.
    let selectedSpecialtyVersion: string | null =
      (config as { selectedSpecialtyVersion?: string | null }).selectedSpecialtyVersion ?? null;
    if (!selectedSpecialtyVersion && config.selectedSpecialty) {
      const manifest = getSpecialtyTemplate(config.selectedSpecialty);
      selectedSpecialtyVersion = manifest?.version ?? null;
    }

    // Snapshot + flip in a single transaction so we never end up with a
    // version row pointing at a config that didn't actually flip.
    const published = await prisma.$transaction(async (tx) => {
      // TODO(EMR-409): the snapshot table column names are taken from the
      // EMR-409 ticket spec — confirm once the migration lands.
      await tx.practiceConfigurationVersion.create({
        data: {
          configurationId: config.id,
          version: nextVersion,
          snapshot: {
            ...(config as unknown as Record<string, unknown>),
            selectedSpecialtyVersion,
          } as unknown as object,
          publishedAt,
          publishedBy: admin.id,
        },
      });

      return tx.practiceConfiguration.update({
        where: { id: config.id },
        data: {
          status: "published",
          version: nextVersion,
          selectedSpecialtyVersion,
          publishedAt,
          publishedBy: admin.id,
        },
      });
    });

    // Bust the unstable_cache entry served by /by-practice/[practiceId]
    revalidateTag(`practice-config:${published.practiceId}`);

    await logControllerAction({
      actor: admin,
      action: "controller.config.published",
      targetId: published.id,
      after: { version: nextVersion, selectedSpecialtyVersion },
    });

    return NextResponse.json(published);
  })) as NextResponse;
}
