// EMR-738 — Cross-tenant search API.
//
// GET /api/admin/search?q=...&entity=...&cursor=...&limit=...
//
// Super-admin only. Returns a tagged-union of patient/order/claim/encounter
// results across every practice in the fleet, each row carrying its
// owning organization. See src/lib/admin/cross-tenant-search.ts for the
// core query module — the route is just an auth gate + URL parsing + audit.
//
// Auth: requireApiAuth({ role: "super_admin" }). Non-super-admin callers
// get a 403 so we can alarm on attempted access (per AC).
//
// Audit: every successful search emits exactly one
//   controller.super_admin.cross_tenant_search
// row via logControllerAction. The `q` value is redacted before
// persistence — emails and phone-shaped strings are truncated to the
// first 3 chars + "***". See redactQuery() for the policy.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { logControllerAction } from "@/lib/auth/audit-stub";
import { prisma } from "@/lib/db/prisma";
import {
  SEARCH_MIN_QUERY_LENGTH,
  decodeCursor,
  parseEntityFilter,
  parseLimit,
  redactQuery,
  runCrossTenantSearch,
} from "@/lib/admin/cross-tenant-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireApiAuth({ role: "super_admin" });
  if (gate.error) return gate.error;
  const actor = gate.actor;

  const url = new URL(req.url);
  const qRaw = (url.searchParams.get("q") ?? "").trim();
  const entity = parseEntityFilter(url.searchParams.get("entity"));
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));

  if (qRaw.length < SEARCH_MIN_QUERY_LENGTH) {
    return NextResponse.json(
      {
        error: "BAD_REQUEST",
        message: `Query must be at least ${SEARCH_MIN_QUERY_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  const response = await runCrossTenantSearch(prisma, {
    q: qRaw,
    entity,
    limit,
    cursor,
  });

  // Audit emission — exactly one row per search. We store the redacted
  // query so we can investigate misuse without persisting PHI. The
  // `after` field carries our search metadata; ControllerAuditLog has no
  // dedicated metadata column today and we don't want to bend the schema
  // for one call site.
  await logControllerAction({
    actor: {
      id: actor.id,
      email: actor.email,
      roles: actor.roles,
      organizationId: actor.organizationId,
    },
    action: "controller.super_admin.cross_tenant_search",
    // Use the actor id as the audit subject — there is no single
    // "target" entity for a cross-tenant search.
    targetId: actor.id,
    after: {
      q: redactQuery(qRaw),
      entity,
      resultCount: response.results.length,
      scannedEntities: response.scannedEntities,
    },
    reason: "cross-tenant search",
  });

  return NextResponse.json(response);
}
