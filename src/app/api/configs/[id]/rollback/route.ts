import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { logControllerAction } from "@/lib/auth/audit-stub";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import {
  RollbackBlockedError,
  createRollbackDraft,
} from "@/lib/db/practice-config-versioning";
import {
  invalidInput,
  notFound,
  readJson,
  withAuthErrors,
} from "../../_helpers";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

const rollbackInput = z.object({
  versionId: z.string().min(1),
  reason: z.string().min(3),
  overrideDeprecatedTemplates: z.boolean().optional(),
});

export async function POST(req: Request, { params }: Ctx) {
  return (await withAuthErrors(async () => {
    const admin = await requireImplementationAdmin();

    const parsedBody = await readJson(req);
    if (!parsedBody.ok) return parsedBody.response;

    const parsed = rollbackInput.safeParse(parsedBody.body);
    if (!parsed.success) return invalidInput(parsed.error);

    try {
      const draft = await createRollbackDraft({
        configurationId: params.id,
        versionId: parsed.data.versionId,
        overrideDeprecatedTemplates:
          parsed.data.overrideDeprecatedTemplates ?? false,
      });
      if (!draft) return notFound();

      revalidateTag(`practice-config:${draft.practiceId}`);
      await logControllerAction({
        actor: admin,
        action: "controller.config.rollback_draft_created",
        targetId: draft.id,
        after: {
          sourceConfigurationId: params.id,
          rolledBackFromVersionId: parsed.data.versionId,
          draftId: draft.id,
        },
        reason: parsed.data.reason,
      });
      return NextResponse.json({ draft }, { status: 201 });
    } catch (err) {
      if (err instanceof RollbackBlockedError) {
        return NextResponse.json(
          {
            error: "deprecated_template_override_required",
            message:
              "This snapshot references deprecated templates. Pass overrideDeprecatedTemplates=true after review.",
          },
          { status: 409 },
        );
      }
      throw err;
    }
  })) as NextResponse;
}
