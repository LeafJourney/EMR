// EMR-435 — Configuration CRUD API
// GET /api/configs/by-practice/[practiceId]
//
// Returns the latest *published* PracticeConfiguration for `practiceId`.
// Callable by any signed-in user. The response is filtered to the fields the
// caller is allowed to see, per `canViewPracticeConfig` (EMR-428):
//   - Practice Admins for that practice → full published config
//   - Everyone else (signed-in)         → thin summary (selectedSpecialty,
//                                          enabledModalities, version)
//
// Cached via `unstable_cache` keyed on practiceId; the cache tag is
// `practice-config:{practiceId}` and is revalidated by the publish + archive
// handlers. We cache the *full* row and project per-caller in the handler so
// we don't poison the cache with role-specific shapes.

import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { canViewPracticeConfig } from "@/lib/auth/super-admin";

export const runtime = "nodejs";

interface Ctx {
  params: { practiceId: string };
}

/**
 * Cached fetch of the latest published config for a practice. Keyed on
 * `practiceId`; tagged so /publish and /archive can revalidate.
 */
function getLatestPublished(practiceId: string) {
  return unstable_cache(
    async () => {
      // TODO(EMR-409): once the schema is in place, confirm the index on
      // (practiceId, status, publishedAt desc) is present so this query is
      // cheap.
      return prisma.practiceConfiguration.findFirst({
        where: { practiceId, status: "published" },
        orderBy: { publishedAt: "desc" },
      });
    },
    ["practice-config:by-practice", practiceId],
    {
      tags: [`practice-config:${practiceId}`],
    },
  )();
}

/**
 * Thin summary projection for non-admin callers. Specialty-adaptive: never
 * branches on a specialty slug.
 */
function thinSummary(config: Record<string, unknown>) {
  const settings = (config.settings ?? {}) as Record<string, unknown>;
  return {
    selectedSpecialty: config.selectedSpecialty ?? null,
    enabledModalities:
      (settings.enabledModalities as unknown[] | undefined) ??
      ((config as Record<string, unknown>).enabledModalities as
        | unknown[]
        | undefined) ??
      [],
    version: config.version ?? 0,
  };
}

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const config = await getLatestPublished(params.practiceId);
  if (!config) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // `canViewPracticeConfig` keys on the Organization id (Membership scope),
  // NOT the Practice id in the route param. Pass the published config's
  // organizationId so a practice_admin scoped to this org sees the full row
  // instead of silently falling through to the thin summary.
  const canViewFull = await canViewPracticeConfig(user, config.organizationId);

  if (canViewFull) {
    return NextResponse.json(config);
  }

  return NextResponse.json(
    thinSummary(config as unknown as Record<string, unknown>),
  );
}
