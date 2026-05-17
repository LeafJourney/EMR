// EMR-435 — Configuration CRUD API
// GET   /api/configs/[id] — full row, Implementation Admin only.
// PATCH /api/configs/[id] — partial update. Rejects payloads that try to
//   change `status`, `version`, `publishedAt`, or `publishedBy` directly —
//   those transitions go through /publish and /archive.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import { withAdminMutation } from "@/lib/auth/with-admin-mutation";
import { logControllerAction } from "@/lib/auth/audit-stub";
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
  },
);
