// EMR-738 — Cross-tenant search page (server component).
//
// Single text input + entity selector. Form submits as a GET so the
// search state is shareable via the URL (?q=...&entity=...). The actual
// search runs server-side via the shared core module, NOT by calling
// our own API route — same DB queries, one fewer hop, simpler error
// handling for the page.
//
// Auth is provided by the parent (super-admin)/layout.tsx, which gates
// on requireSuperAdmin(). The API route in this PR is also super-admin
// gated, so the data is double-gated regardless of which entry-point
// the operator hits.
//
// TODO(EMR-738-hq-integration): wire this search box into /admin/hq as
// a top-level command palette. Deferred from this PR to avoid merge
// conflict with PR #344 (HQ shell). The standalone page exists in the
// meantime so ops/support can use it day-one.
//
// TODO(EMR-738-csv-export): add a "Download CSV" button to the results
// table once PR #341 (EMR-749) lands the streamCsvResponse utility.
// Deferred from this PR to avoid blocking on the unmerged dependency.

import { redirect } from "next/navigation";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Breadcrumbs } from "@/components/super-admin/breadcrumbs";
import { prisma } from "@/lib/db/prisma";
import {
  SEARCH_ENTITY_KINDS,
  SEARCH_MIN_QUERY_LENGTH,
  createdAtForResult,
  decodeCursor,
  deepLinkForResult,
  displayNameForResult,
  parseEntityFilter,
  parseLimit,
  redactQuery,
  runCrossTenantSearch,
  type SearchEntityFilter,
} from "@/lib/admin/cross-tenant-search";
import { logControllerAction } from "@/lib/auth/audit-stub";
import { requireUser } from "@/lib/auth/session";
import { SearchResultsIsland, type SearchRowLink } from "./search-results-island";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cross-tenant search" };

const ENTITY_OPTIONS: Array<{ value: SearchEntityFilter; label: string }> = [
  { value: "all", label: "All" },
  ...SEARCH_ENTITY_KINDS.map((k) => ({
    value: k as SearchEntityFilter,
    label: k.charAt(0).toUpperCase() + k.slice(1),
  })),
];

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function CrossTenantSearchPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ?? {};
  const qRaw = (first(params.q) ?? "").trim();
  const entity = parseEntityFilter(first(params.entity));
  const limit = parseLimit(first(params.limit));
  const cursor = decodeCursor(first(params.cursor));

  const hasQuery = qRaw.length >= SEARCH_MIN_QUERY_LENGTH;

  // Run the search when the operator has typed enough. Below the
  // minimum length we just render the empty form — no DB hit, no audit
  // row.
  let resultRows: SearchRowLink[] = [];
  let nextCursorParam: string | null = null;
  let resultCount = 0;
  if (hasQuery) {
    // Re-check auth here so the page never renders results to a non-
    // super-admin even if the layout gate is bypassed somehow. Cheap.
    const actor = await requireUser();
    if (!actor.roles.includes("super_admin")) {
      redirect("/");
    }

    const response = await runCrossTenantSearch(prisma, {
      q: qRaw,
      entity,
      limit,
      cursor,
    });
    resultCount = response.results.length;
    nextCursorParam = response.nextCursor;

    resultRows = response.results.map((r) => {
      const created = createdAtForResult(r);
      return {
        href: deepLinkForResult(r),
        cells: [
          r.kind,
          r.organizationName,
          r.id,
          displayNameForResult(r),
          created ? created.toISOString().slice(0, 10) : "—",
        ],
      } satisfies SearchRowLink;
    });

    // Audit emission — exactly one row per page render that actually
    // ran a search. Mirrors the API-route audit so we capture both
    // entry points without double-counting (the page does NOT call
    // the API; each entry point logs once).
    await logControllerAction({
      actor: {
        id: actor.id,
        email: actor.email,
        roles: actor.roles,
        organizationId: actor.organizationId,
      },
      action: "controller.super_admin.cross_tenant_search",
      targetId: actor.id,
      after: {
        q: redactQuery(qRaw),
        entity,
        resultCount,
        scannedEntities: response.scannedEntities,
        surface: "page",
      },
      reason: "cross-tenant search (page)",
    });
  }

  const redactedEcho = hasQuery ? redactQuery(qRaw) : "";

  return (
    <PageShell>
      <Breadcrumbs
        items={[
          { label: "HQ", href: "/admin/hq" },
          { label: "Operations" },
          { label: "Cross-tenant search" },
        ]}
      />
      <PageHeader
        eyebrow="Internal"
        title="Cross-tenant search"
        description="Find a patient, order, claim, or encounter across every practice. Practice column is always visible — never lose tenant context."
      />

      <form method="GET" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-xs text-text-muted mb-1" htmlFor="q">
            Query
          </label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={qRaw}
            placeholder="Name, email, phone, or ID"
            autoFocus
            minLength={SEARCH_MIN_QUERY_LENGTH}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1" htmlFor="entity">
            Entity
          </label>
          <select
            id="entity"
            name="entity"
            defaultValue={entity}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {ENTITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
        >
          Search
        </button>
      </form>

      {hasQuery && (
        <p className="text-xs text-text-muted mb-3">
          Audited as <code className="font-mono">{redactedEcho}</code> ·{" "}
          {resultCount} result{resultCount === 1 ? "" : "s"}
        </p>
      )}

      {hasQuery ? (
        <SearchResultsIsland
          rows={resultRows}
          columns={["Kind", "Practice", "Primary ID", "Display", "Created"]}
          emptyState={
            <div className="rounded-md border border-dashed border-border px-6 py-12 text-center">
              <p className="text-sm text-text-muted">
                No matches for <code className="font-mono">{redactedEcho}</code>.
              </p>
            </div>
          }
        />
      ) : (
        <div className="rounded-md border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-text-muted">
            Type at least {SEARCH_MIN_QUERY_LENGTH} characters to search.
          </p>
        </div>
      )}

      {hasQuery && nextCursorParam && (
        <div className="mt-4">
          <a
            href={`?q=${encodeURIComponent(qRaw)}&entity=${entity}&cursor=${encodeURIComponent(nextCursorParam)}`}
            className="text-sm text-accent underline"
          >
            Next page →
          </a>
        </div>
      )}
    </PageShell>
  );
}
