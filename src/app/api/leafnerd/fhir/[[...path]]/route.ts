import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getAuditTail,
  getCapabilityStatement,
  getLakehouseCatalog,
  everythingForPatient,
  historyOfResource,
  readLakehouseResource,
  searchLakehouse,
} from "@/lib/leafnerd/lakehouse-data";
import { collectionBundle, historyBundle, searchsetBundle } from "@/lib/lakehouse";
import type { Role } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/leafnerd/fhir/[...path]
 *
 * Read-only FHIR R4 query surface over the LeafBridge Gold zone (materialized
 * from the leafnerd-demo tenant). Routes mirror the FHIR REST grammar:
 *
 *   /api/leafnerd/fhir                      → lakehouse catalog (zones + types)
 *   /api/leafnerd/fhir/metadata             → CapabilityStatement
 *   /api/leafnerd/fhir/$audit?_count=N      → audit chain tail (+ verification)
 *   /api/leafnerd/fhir/{Type}?{params}      → searchset Bundle
 *   /api/leafnerd/fhir/{Type}/{id}          → a single resource
 *   /api/leafnerd/fhir/{Type}/{id}/_history → history Bundle
 *   /api/leafnerd/fhir/Patient/{id}/$everything → compartment collection Bundle
 *
 * Access mirrors the /leafnerd page: enforced in production (leafnerd /
 * super_admin role), open in dev for local iteration.
 */
const LEAFNERD_ROLES: Role[] = ["leafnerd", "super_admin"];

const json = (body: unknown, init?: number | ResponseInit) =>
  NextResponse.json(body, typeof init === "number" ? { status: init } : init);

const operationOutcome = (severity: string, code: string, diagnostics: string, status: number) =>
  json(
    {
      resourceType: "OperationOutcome",
      issue: [{ severity, code, diagnostics }],
    },
    status,
  );

export async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  // Access gate — enforced in production only.
  if (process.env.NODE_ENV === "production") {
    const user = await getCurrentUser().catch(() => null);
    if (!user) return operationOutcome("error", "login", "Authentication required", 401);
    if (!user.roles.some((r) => LEAFNERD_ROLES.includes(r))) {
      return operationOutcome("error", "forbidden", "Leafnerd access required", 403);
    }
  }

  const { path = [] } = await ctx.params;
  const url = new URL(req.url);
  const query: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of url.searchParams.entries()) {
    const existing = query[k];
    query[k] = existing === undefined ? v : Array.isArray(existing) ? [...existing, v] : [existing, v];
  }

  // ---- Metadata / catalog / audit -----------------------------------------
  if (path.length === 0 || path[0] === "$catalog") {
    const catalog = await getLakehouseCatalog();
    return catalog ? json(catalog) : operationOutcome("error", "exception", "catalog unavailable", 503);
  }
  if (path[0] === "metadata") {
    const cap = await getCapabilityStatement();
    return cap ? json(cap) : operationOutcome("error", "exception", "metadata unavailable", 503);
  }
  if (path[0] === "$audit") {
    const limit = Math.min(200, Math.max(1, Number(query._count) || 25));
    return json(await getAuditTail(limit));
  }

  const resourceType = path[0];
  if (!/^[A-Z][A-Za-z]+$/.test(resourceType)) {
    return operationOutcome("error", "not-found", `Unknown route segment '${resourceType}'`, 404);
  }

  // ---- /{Type} → search ----------------------------------------------------
  if (path.length === 1) {
    const count = Math.min(200, Math.max(1, Number(query._count) || 50));
    const offset = Math.max(0, Number(query._offset) || 0);
    const sort = typeof query._sort === "string" ? query._sort : undefined;
    const { resources, total } = await searchLakehouse(resourceType, query, { count, offset, sort });
    return json(
      searchsetBundle(resources, { total, selfUrl: url.toString() }),
    );
  }

  const id = path[1];

  // ---- /Patient/{id}/$everything ------------------------------------------
  if (path.length === 3 && path[2] === "$everything" && resourceType === "Patient") {
    return json(collectionBundle(await everythingForPatient(id)));
  }

  // ---- /{Type}/{id}/_history ----------------------------------------------
  if (path.length === 3 && path[2] === "_history") {
    return json(historyBundle(await historyOfResource(resourceType, id)));
  }

  // ---- /{Type}/{id}/_history/{vid} → vread --------------------------------
  if (path.length === 4 && path[2] === "_history") {
    const versions = await historyOfResource(resourceType, id);
    const match = versions.find((v) => v.versionId === path[3]);
    return match ? json(match.body) : operationOutcome("error", "not-found", "version not found", 404);
  }

  // ---- /{Type}/{id} → read -------------------------------------------------
  if (path.length === 2) {
    const resource = await readLakehouseResource(resourceType, id);
    return resource
      ? json(resource)
      : operationOutcome("error", "not-found", `${resourceType}/${id} not found`, 404);
  }

  return operationOutcome("error", "not-found", "Unsupported FHIR route", 404);
}
