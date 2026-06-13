// EMR-435 — Configuration CRUD API
// GET   /api/configs/[id] — full row, Implementation Admin only.
// PATCH /api/configs/[id] — partial update. Rejects payloads that try to
//   change `status`, `version`, `publishedAt`, or `publishedBy` directly —
//   those transitions go through /publish and /archive.

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import { logControllerAction } from "@/lib/auth/audit-stub";
import { withAdminMutation } from "@/lib/auth/with-admin-mutation";
// TODO(EMR-409): swap to the canonical `DraftPracticeConfigurationInput`
// re-export from src/lib/practice-config/types.ts once that file lands. For
// now we accept the partial JSON-blob shape EMR-409 documents.
import type { DraftPracticeConfigurationInput } from "@/lib/practice-config/types";
import { draftPracticeConfigSchema } from "@/lib/practice-config/schema";
import {
  readJson,
  invalidInput,
  withAuthErrors,
  notFound,
  PROTECTED_PATCH_FIELDS,
} from "../_helpers";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// We use draftPracticeConfigSchema and ensure protected fields aren't modified.
const patchInput = draftPracticeConfigSchema.refine(
  (obj) =>
    PROTECTED_PATCH_FIELDS.every(
      (key) => !Object.prototype.hasOwnProperty.call(obj, key),
    ),
  {
    message: `PATCH may not modify protected fields: ${PROTECTED_PATCH_FIELDS.join(", ")}`,
  },
);

export async function GET(_req: Request, { params }: Ctx) {
  return (await withAuthErrors(async () => {
    await requireImplementationAdmin();

    const config = await prisma.practiceConfiguration.findUnique({
      where: { id: params.id },
    });
    if (!config) return notFound();

    return NextResponse.json(config);
  })) as NextResponse;
}

export const PATCH = withAdminMutation<{ id: string }>(
  { bucket: "admin.config.update", role: "implementation_admin" },
  async (req, { actor: admin, params }) => {
  return (await withAuthErrors(async () => {
    const parsedBody = await readJson(req);
    if (!parsedBody.ok) return parsedBody.response;

    const parsed = patchInput.safeParse(parsedBody.body);
    if (!parsed.success) return invalidInput(parsed.error);

    // Cast to the canonical draft shape once EMR-409 lands; until then the
    // type is imported but only used as a documentation anchor for callers.
    const update = parsed.data as Partial<DraftPracticeConfigurationInput>;

    const existing = await prisma.practiceConfiguration.findUnique({
      where: { id: params.id },
    });
    if (!existing) return notFound();

    // EMR-436 — only a draft is editable. Blocking the protected fields above
    // stops a status/version flip via PATCH, but the content fields of an
    // already-published (live) row would otherwise remain mutable in place,
    // changing the source-of-truth a practice is actively running without a
    // new version snapshot or cache revalidation. Edits to a live practice
    // must fork a fresh draft, not mutate the published row.
    if (existing.status !== "draft") {
      return NextResponse.json(
        {
          error: "conflict",
          reason: "cannot_edit_published_config",
          status: existing.status,
        },
        { status: 409 },
      );
    }

    const updated = await prisma.practiceConfiguration.update({
      where: { id: params.id },
      data: update as Prisma.PracticeConfigurationUpdateInput,
    });

    await logControllerAction({
      actor: admin,
      action: "controller.config.updated",
      targetId: updated.id,
      after: { keys: Object.keys(update) },
    });

    return NextResponse.json(updated);
  })) as NextResponse;
  },
);
