// EMR-435 — Configuration CRUD API
// POST /api/configs/[id]/archive — flip status → 'archived'.

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { logControllerAction } from "@/lib/auth/audit-stub";
import { withAdminMutation } from "@/lib/auth/with-admin-mutation";
import {
  type ConfigStatus,
  canTransition,
} from "@/lib/db/practice-config-status";
import { withAuthErrors, notFound } from "../../_helpers";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

export const POST = withAdminMutation<{ id: string }>(
  { bucket: "admin.config.archive", role: "implementation_admin" },
  async (_req, { actor: admin, params }) => {
  return (await withAuthErrors(async () => {
    const existing = await prisma.practiceConfiguration.findUnique({
      where: { id: params.id },
    });
    if (!existing) return notFound();

    // EMR-436 — only draft/published can be archived; archiving an already
    // archived row is a 409 (idempotent-looking double-submit, surfaced as a
    // client error rather than a silent no-op).
    if (!canTransition(existing.status as ConfigStatus, "archived")) {
      return NextResponse.json(
        {
          error: "conflict",
          reason: "invalid_state",
          from: existing.status,
          to: "archived",
        },
        { status: 409 },
      );
    }

    const archived = await prisma.practiceConfiguration.update({
      where: { id: params.id },
      data: { status: "archived" },
    });

    // If this row was the currently-published config for its practice, the
    // by-practice cache must be busted so callers see the change. We bust
    // unconditionally — it's cheap and avoids a stale-read race.
    revalidateTag(`practice-config:${archived.practiceId}`);

    await logControllerAction({
      actor: admin,
      action: "controller.config.archived",
      targetId: archived.id,
    });

    return NextResponse.json(archived);
  })) as NextResponse;
  },
);
