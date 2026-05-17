// EMR-435 — Configuration CRUD API
// POST /api/configs/[id]/archive — flip status → 'archived'.

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { withAdminMutation } from "@/lib/auth/with-admin-mutation";
import { logControllerAction } from "@/lib/auth/audit-stub";
import { notFound } from "../../_helpers";

export const runtime = "nodejs";

export const POST = withAdminMutation<{ id: string }>(
  { bucket: "admin.config.archive", role: "implementation_admin" },
  async (_req, { actor: admin, params }) => {
    const existing = await prisma.practiceConfiguration.findUnique({
      where: { id: params.id },
    });
    if (!existing) return notFound();

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
  },
);
