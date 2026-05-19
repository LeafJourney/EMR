// EMR-431 — Template upgrade admin action.
// POST /api/configs/[id]/upgrade-template
//
// Body: { targetVersion: string }
//
// Migrates a practice configuration to a different version of the SAME
// specialty template. The config's `selectedSpecialty` does not change —
// only `selectedSpecialtyVersion`. The target manifest must:
//   1. Exist for the config's `selectedSpecialty`.
//   2. NOT be deprecated.
//
// v1 scope discipline (deferred to a future ticket):
//   - This route does NOT re-apply template defaults. Doing so would clobber
//     admin-edited modality lists, workflow IDs, charting templates, etc.
//     The upgrade is a pointer flip only; runtime renderers pick up the new
//     manifest version on the next read. The diff between old and new
//     defaults is the responsibility of the (deferred) upgrade-review UI,
//     which will let an implementation admin opt in/out of individual field
//     changes before flipping the pointer.
//   - There is no cross-config bulk upgrade — each practice is upgraded
//     individually so an admin can review per-practice impact.
//
// Auth: requireImplementationAdmin. Audited via logControllerAction.

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import { logControllerAction } from "@/lib/auth/audit-stub";
import { getSpecialtyTemplate } from "@/lib/specialty-templates/registry";
import {
  readJson,
  invalidInput,
  withAuthErrors,
  notFound,
} from "../../_helpers";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const bodySchema = z.object({
  targetVersion: z.string().regex(SEMVER, "targetVersion must be semver"),
});

export async function POST(req: Request, { params }: Ctx) {
  return (await withAuthErrors(async () => {
    const admin = await requireImplementationAdmin();

    const parsedBody = await readJson(req);
    if (!parsedBody.ok) return parsedBody.response;

    const parsed = bodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return invalidInput(parsed.error);

    const { targetVersion } = parsed.data;

    const config = await prisma.practiceConfiguration.findUnique({
      where: { id: params.id },
    });
    if (!config) return notFound();

    if (!config.selectedSpecialty) {
      return NextResponse.json(
        {
          error: "conflict",
          message:
            "Configuration has no selectedSpecialty — cannot upgrade a " +
            "template version on a config without a specialty.",
        },
        { status: 409 },
      );
    }

    // Resolve the target manifest by EXACT (slug, version). If it does not
    // exist for this slug we 404 — clearer than a 400 because the client is
    // pointing at a target that simply isn't in the registry.
    const target = getSpecialtyTemplate(config.selectedSpecialty, targetVersion);
    if (!target) {
      return NextResponse.json(
        {
          error: "not_found",
          message:
            `Manifest "${config.selectedSpecialty}@${targetVersion}" is not ` +
            `registered. Use listAllManifestVersions() to enumerate available ` +
            `versions.`,
        },
        { status: 404 },
      );
    }

    if (target.deprecated === true) {
      return NextResponse.json(
        {
          error: "conflict",
          message:
            `Manifest "${config.selectedSpecialty}@${targetVersion}" is ` +
            `deprecated and may not be used as an upgrade target. Existing ` +
            `practices on a deprecated version continue to render, but new ` +
            `upgrades must point at a non-deprecated version.`,
        },
        { status: 409 },
      );
    }

    const previousVersion = config.selectedSpecialtyVersion ?? null;

    // No-op short-circuit: upgrading to the same version is harmless but we
    // surface it as a 200 with `noop: true` so admin tooling can detect the
    // case without parsing the row diff.
    if (previousVersion === targetVersion) {
      return NextResponse.json({
        ...config,
        noop: true,
      });
    }

    const upgraded = await prisma.practiceConfiguration.update({
      where: { id: params.id },
      data: { selectedSpecialtyVersion: targetVersion },
    });

    // Bust the by-practice cache so renderers pick up the new manifest
    // version on next read. This is the same tag the publish/archive routes
    // bust — pointer changes are equivalent to a publish from the renderer's
    // perspective.
    revalidateTag(`practice-config:${upgraded.practiceId}`);

    await logControllerAction({
      actor: admin,
      action: "controller.config.template_upgraded",
      targetId: upgraded.id,
      before: {
        selectedSpecialty: config.selectedSpecialty,
        selectedSpecialtyVersion: previousVersion,
      },
      after: {
        selectedSpecialty: upgraded.selectedSpecialty,
        selectedSpecialtyVersion: upgraded.selectedSpecialtyVersion,
      },
    });

    return NextResponse.json(upgraded);
  })) as NextResponse;
}
