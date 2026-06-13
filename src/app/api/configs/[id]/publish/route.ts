// EMR-435 — Configuration CRUD API
// POST /api/configs/[id]/publish
//
// Validates go-live readiness (`selectedSpecialty`, `careModel`, ≥1 enabled
// modality, ≥1 charting + ≥1 workflow template, ≥1 active provider, and a
// CMS-Luhn-valid practice NPI), snapshots the row into
// `PracticeConfigurationVersion`,
// increments `version`, flips `status` → 'published', sets publishedAt /
// publishedBy, and revalidates the by-practice cache tag.

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { logControllerAction } from "@/lib/auth/audit-stub";
import { withAdminMutation } from "@/lib/auth/with-admin-mutation";
import { getSpecialtyTemplate } from "@/lib/specialty-templates/registry";
import { isValidNpi } from "@/lib/billing/identifiers";
import {
  type ConfigStatus,
  canTransition,
} from "@/lib/db/practice-config-status";
import { withAuthErrors, notFound } from "../../_helpers";
import { findMissing } from "./readiness";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

export const POST = withAdminMutation<{ id: string }>(
  { bucket: "admin.config.publish", role: "implementation_admin" },
  async (_req, { actor: admin, params }) => {
  return (await withAuthErrors(async () => {
    const config = await prisma.practiceConfiguration.findUnique({
      where: { id: params.id },
    });
    if (!config) return notFound();

    // EMR-436 — state-machine guard. Only a draft can be published. A
    // double-submit or a publish against an already-published/archived row is a
    // client error (409), not a 500.
    if (!canTransition(config.status as ConfigStatus, "published")) {
      return NextResponse.json(
        {
          error: "conflict",
          reason: "invalid_state",
          from: config.status,
          to: "published",
        },
        { status: 409 },
      );
    }

    const missing = findMissing(config as unknown as Record<string, unknown>);

    // Cross-record go-live readiness (needs the DB, so it can't live in the
    // pure structural check above):
    //   - activeProvider : a practice may not go live with nobody to see
    //                      patients / be assigned encounters and claims.
    //   - practiceNpi    : the billing group NPI must be present AND pass the
    //                      CMS-Luhn checksum (the onboarding create routes only
    //                      length-check it), else the first claim fails.
    const [activeProvider, practice] = await Promise.all([
      prisma.provider.findFirst({
        where: { organizationId: config.organizationId, active: true },
        select: { id: true },
      }),
      prisma.practice.findUnique({
        where: { id: config.practiceId },
        select: { npi: true },
      }),
    ]);
    if (!activeProvider) missing.push("activeProvider");
    if (!isValidNpi(practice?.npi)) missing.push("practiceNpi");

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
      // EMR-436 — single-tenant publish constraint: at most one published
      // config per practice. Demote any OTHER currently-published config for
      // this practice to `archived` BEFORE promoting this one, inside the same
      // transaction. The partial unique index (status='published') is the
      // defense-in-depth backstop; this keeps the demoted row's lifecycle
      // explicit and auditable rather than relying on a constraint violation.
      await tx.practiceConfiguration.updateMany({
        where: {
          practiceId: config.practiceId,
          status: "published",
          id: { not: config.id },
        },
        data: { status: "archived" },
      });

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
  },
);
