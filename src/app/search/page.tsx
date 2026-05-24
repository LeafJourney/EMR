// UX run — /search global results page.
//
// Stripe / Linear-style universal results across patients, messages,
// notes, and audit. Complements the ⌘K command palette (which is for
// fast actions / jumps); this page is for deeper queries and "show me
// every match" exploration.
//
// URL shape:
//   /search?q=<query>&category=<all|patients|messages|notes|audit>&offset=<n>
//
// All four categories are clinician-data. We gate on the clinic-floor
// role set, the same one the (clinician) layout uses. Sitting outside
// the (clinician) route group lets the page live at a clean top-level
// `/search` URL the command palette can deep-link to.
//
// Highlighting: every snippet runs through `highlightSegments()` and
// matched chunks get wrapped in `<mark>` — the only HTML-shaped markup
// emitted from user-controlled text.

import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { ROLE_HOME, primaryRole } from "@/lib/rbac/roles";
import type { Role } from "@prisma/client";
import {
  GLOBAL_SEARCH_CATEGORIES,
  GLOBAL_SEARCH_GROUP_PREVIEW,
  GLOBAL_SEARCH_MIN_QUERY,
  GLOBAL_SEARCH_PAGE_SIZE,
  type GlobalSearchCategory,
  type GlobalSearchCategoryFilter,
  type GlobalSearchHit,
  type GlobalSearchResults,
  highlightSegments,
  parseCategoryFilter,
  parseLimit,
  parseOffset,
  searchAcrossEMR,
  totalResults,
} from "@/lib/domain/global-search";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

const CLINIC_FLOOR_ROLES: Role[] = [
  "clinician",
  "midlevel",
  "back_office",
  "front_office",
  "practice_owner",
];

const CATEGORY_TABS: Array<{
  value: GlobalSearchCategoryFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  ...GLOBAL_SEARCH_CATEGORIES.map((c) => ({
    value: c as GlobalSearchCategoryFilter,
    label: c.charAt(0).toUpperCase() + c.slice(1),
  })),
];

const CATEGORY_BADGE_TONE: Record<
  GlobalSearchCategory,
  "accent" | "info" | "success" | "neutral"
> = {
  patients: "accent",
  messages: "info",
  notes: "success",
  audit: "neutral",
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function SearchPage({
  searchParams,
}: {
  // Next 15: searchParams is async.
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (first(params.q) ?? "").trim();
  const category = parseCategoryFilter(first(params.category));
  const offset = parseOffset(first(params.offset));
  const limit = parseLimit(
    first(params.limit),
    category === "all" ? GLOBAL_SEARCH_GROUP_PREVIEW : GLOBAL_SEARCH_PAGE_SIZE,
  );

  // Auth — this surface holds patient PHI. Must be a clinic-floor role
  // with an org. Anonymous → sign-in. Wrong role → home.
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/search?q=${q}`)}`);
  }
  if (!user.roles.some((r) => CLINIC_FLOOR_ROLES.includes(r))) {
    redirect(ROLE_HOME[primaryRole(user.roles)] ?? "/");
  }
  const organizationId = user.organizationId;

  // Empty-query short-circuit: render the chrome, no data fetch.
  let results: GlobalSearchResults | null = null;
  if (organizationId && q.length >= GLOBAL_SEARCH_MIN_QUERY) {
    results = await searchAcrossEMR(prisma, q, organizationId, {
      category,
      limit,
      offset,
    });
  }

  const total = results ? totalResults(results) : 0;

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Universal search"
        title="Search"
        description="Find patients, messages, notes, and audit events across your practice."
      />

      {/* Search form. GET so URL stays shareable. */}
      <form
        action="/search"
        method="get"
        className="flex flex-col sm:flex-row gap-3 mb-6"
        role="search"
        aria-label="Global search"
      >
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search patients, messages, notes, audit…"
          className="flex-1 h-12 text-base"
          autoFocus
          // Browser-level autocomplete is noisy for clinical lookups.
          autoComplete="off"
          aria-label="Search query"
        />
        <input type="hidden" name="category" value={category} />
        <Button type="submit" size="md">
          Search
        </Button>
      </form>

      {/* Category tabs. Anchor-based so they survive a hard nav. */}
      <CategoryTabs activeCategory={category} q={q} results={results} />

      <div className="mt-6">
        {q.length === 0 ? (
          <StartState />
        ) : q.length < GLOBAL_SEARCH_MIN_QUERY ? (
          <ShortQueryState />
        ) : !organizationId ? (
          <EmptyState
            title="No practice attached to your account"
            description="Reach out to your practice admin to be added to an organization before searching."
          />
        ) : total === 0 && results ? (
          <NoResultsState q={q} category={category} />
        ) : (
          results && (
            <ResultsBody
              q={q}
              category={category}
              results={results}
              offset={offset}
              limit={limit}
            />
          )
        )}
      </div>
    </PageShell>
  );
}

// ── Subcomponents ─────────────────────────────────────────────

function CategoryTabs({
  activeCategory,
  q,
  results,
}: {
  activeCategory: GlobalSearchCategoryFilter;
  q: string;
  results: GlobalSearchResults | null;
}) {
  const counts: Record<GlobalSearchCategoryFilter, number | null> = {
    all: results ? totalResults(results) : null,
    patients: results?.patients.total ?? null,
    messages: results?.messages.total ?? null,
    notes: results?.notes.total ?? null,
    audit: results?.audit.total ?? null,
  };
  return (
    <nav
      role="tablist"
      aria-label="Search categories"
      className="flex flex-wrap gap-1 border-b border-border"
    >
      {CATEGORY_TABS.map((tab) => {
        const isActive = tab.value === activeCategory;
        const href = `/search?q=${encodeURIComponent(q)}&category=${tab.value}`;
        const n = counts[tab.value];
        return (
          <Link
            key={tab.value}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={
              "px-3 py-2 text-sm border-b-2 -mb-px transition-colors " +
              (isActive
                ? "border-accent text-accent font-medium"
                : "border-transparent text-text-muted hover:text-text")
            }
          >
            {tab.label}
            {n !== null && (
              <span className="ml-1.5 text-xs text-text-subtle">
                {n}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function StartState() {
  return (
    <EmptyState
      title="Type a query to search across your practice"
      description="Patients by name, email or phone. Messages, notes, and audit events by their content. Press ⌘K for quick jumps and actions."
      tips={[
        "Try a partial last name — searches are case-insensitive.",
        'Filter by category using the tabs above once you have results.',
        "Audit search matches action names like \"note.finalized\".",
      ]}
    />
  );
}

function ShortQueryState() {
  return (
    <EmptyState
      title="Add one more character"
      description={`Searches start at ${GLOBAL_SEARCH_MIN_QUERY} characters so we don't drown you in noise.`}
    />
  );
}

function NoResultsState({
  q,
  category,
}: {
  q: string;
  category: GlobalSearchCategoryFilter;
}) {
  const isFiltered = category !== "all";
  return (
    <EmptyState
      title={`No matches for "${q}"`}
      description={
        isFiltered
          ? "Try widening to All, or rephrase your query — even a partial match across name, email or phone will surface a patient."
          : "Try a shorter or differently spelled query, or check that you're looking in the right practice."
      }
      primaryAction={
        isFiltered ? (
          <Link
            href={`/search?q=${encodeURIComponent(q)}&category=all`}
            className="inline-flex items-center px-4 py-2 rounded-md bg-accent text-on-accent text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Search across all categories
          </Link>
        ) : undefined
      }
      tips={[
        "Last-name and first-name searches are case-insensitive.",
        "For audit events, try the action key (e.g. \"note.finalized\").",
      ]}
    />
  );
}

function ResultsBody({
  q,
  category,
  results,
  offset,
  limit,
}: {
  q: string;
  category: GlobalSearchCategoryFilter;
  results: GlobalSearchResults;
  offset: number;
  limit: number;
}) {
  // Single-category view: one section, paginated.
  if (category !== "all") {
    const group = results[category];
    return (
      <section aria-label={`${category} results`}>
        <SectionHeader
          category={category}
          total={group.total}
          showSeeAll={false}
          q={q}
        />
        {group.items.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center">
            No more results in this category.
          </p>
        ) : (
          <ul className="divide-y divide-border/70 border border-border rounded-xl bg-surface">
            {group.items.map((hit) => (
              <li key={`${hit.kind}:${hit.id}`}>
                <ResultRow hit={hit} q={q} />
              </li>
            ))}
          </ul>
        )}
        <Pagination
          q={q}
          category={category}
          offset={offset}
          limit={limit}
          total={group.total}
          shown={group.items.length}
        />
      </section>
    );
  }

  // "All" view: top-N preview per group with "See all N →".
  return (
    <div className="space-y-10">
      {(["patients", "messages", "notes", "audit"] as const).map((cat) => {
        const group = results[cat];
        if (group.total === 0) return null;
        return (
          <section key={cat} aria-label={`${cat} results`}>
            <SectionHeader
              category={cat}
              total={group.total}
              showSeeAll={group.total > group.items.length}
              q={q}
            />
            <ul className="divide-y divide-border/70 border border-border rounded-xl bg-surface">
              {group.items.map((hit) => (
                <li key={`${hit.kind}:${hit.id}`}>
                  <ResultRow hit={hit} q={q} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function SectionHeader({
  category,
  total,
  showSeeAll,
  q,
}: {
  category: GlobalSearchCategory;
  total: number;
  showSeeAll: boolean;
  q: string;
}) {
  return (
    <div className="flex items-end justify-between mb-2">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg text-text">
          {category.charAt(0).toUpperCase() + category.slice(1)}
        </h2>
        <Badge tone="neutral">{total}</Badge>
      </div>
      {showSeeAll && (
        <Link
          href={`/search?q=${encodeURIComponent(q)}&category=${category}`}
          className="text-sm text-accent hover:underline"
        >
          See all {total} →
        </Link>
      )}
    </div>
  );
}

function ResultRow({ hit, q }: { hit: GlobalSearchHit; q: string }) {
  const dateLabel =
    hit.kind === "message" || hit.kind === "note" || hit.kind === "audit"
      ? hit.createdAt.toISOString().slice(0, 10)
      : null;
  return (
    <Link
      href={hit.href}
      className="block px-4 py-3 hover:bg-surface-muted/60 transition-colors focus-visible:bg-surface-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-text truncate">
              <Highlight text={hit.title} q={q} />
            </p>
            <Badge tone={CATEGORY_BADGE_TONE[hit.kind === "patient" ? "patients" : hit.kind === "message" ? "messages" : hit.kind === "note" ? "notes" : "audit"]}>
              {hit.kind}
            </Badge>
          </div>
          {hit.snippet && (
            <p className="text-[13px] text-text-muted mt-1 leading-snug line-clamp-2">
              <Highlight text={hit.snippet} q={q} />
            </p>
          )}
        </div>
        {dateLabel && (
          <span className="text-[11px] text-text-subtle shrink-0 tabular-nums">
            {dateLabel}
          </span>
        )}
      </div>
    </Link>
  );
}

/**
 * Wraps every case-insensitive occurrence of `q` in <mark>. Renders via
 * the pre-built segment list from the domain helper — no innerHTML, no
 * dangerouslySetInnerHTML. The <mark> element gets a subtle background
 * so it reads as a highlight rather than a yellow blob.
 */
function Highlight({ text, q }: { text: string; q: string }) {
  const segments = highlightSegments(text, q);
  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark
            key={i}
            className="bg-highlight-soft text-text px-0.5 rounded-sm font-medium"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function Pagination({
  q,
  category,
  offset,
  limit,
  total,
  shown,
}: {
  q: string;
  category: GlobalSearchCategory;
  offset: number;
  limit: number;
  total: number;
  shown: number;
}) {
  const hasPrev = offset > 0;
  const hasNext = offset + shown < total;
  if (!hasPrev && !hasNext) return null;
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  return (
    <div className="flex items-center justify-between mt-4 text-sm">
      <span className="text-text-subtle">
        Showing {offset + 1}–{offset + shown} of {total}
      </span>
      <div className="flex gap-2">
        {hasPrev && (
          <Link
            href={`/search?q=${encodeURIComponent(q)}&category=${category}&offset=${prevOffset}`}
            className="px-3 py-1.5 rounded-md border border-border hover:bg-surface-muted text-text"
          >
            ← Previous
          </Link>
        )}
        {hasNext && (
          <Link
            href={`/search?q=${encodeURIComponent(q)}&category=${category}&offset=${nextOffset}`}
            className="px-3 py-1.5 rounded-md border border-border hover:bg-surface-muted text-text"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}
