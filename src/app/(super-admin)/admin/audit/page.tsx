// EMR-747 — ControllerAuditLog viewer.
//
// Server component. Filters live entirely in URL params so the page is
// deep-linkable and shareable. Filter chips above the table let the
// operator drop individual filters with a click; the form below lets
// them set new ones. Cursor pagination via "Load more" — no offset.
//
// The data fetch happens server-side via `runAuditQuery`, not by calling
// our own API route. Same query path, one fewer hop, simpler error
// handling on the page. The API route still exists for programmatic
// consumers (operators paging through with curl during an incident).
//
// Keyboard nav (j/k/Enter, "/" → action filter) lives in
// keyboard-island.tsx — a small client island over the server-rendered
// table. We do NOT audit the read of /admin/audit on render (would
// create a feedback loop, see route.ts header).

import { redirect } from "next/navigation";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Breadcrumbs } from "@/components/super-admin/breadcrumbs";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  encodeCursor,
  metadataPreview,
  parseAuditQuery,
  runAuditQuery,
  type AuditQuery,
} from "@/lib/admin/audit-log";
import { AuditTableIsland, type AuditRowView } from "./keyboard-island";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

type SearchParams = Record<string, string | string[] | undefined>;

function relativeTime(iso: string): string {
  // Inline relative-time formatter — pulling in date-fns or
  // Intl.RelativeTimeFormat for one place is overkill, and we want stable
  // strings during SSR so the operator's first paint matches the URL.
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso;
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(then).toISOString().slice(0, 10);
}

/** Build a relative URL with the same filters minus the supplied key. */
function urlWithout(q: AuditQuery, key: keyof AuditQuery): string {
  const params = new URLSearchParams();
  const set = (k: string, v: string | null | undefined) => {
    if (v != null && v !== "") params.set(k, v);
  };
  set("actor", key === "actor" ? null : q.actor);
  set("action", key === "action" ? null : q.action);
  set("target", key === "target" ? null : q.target);
  set("from", key === "from" ? null : q.from?.toISOString().slice(0, 10) ?? null);
  set("to", key === "to" ? null : q.to?.toISOString().slice(0, 10) ?? null);
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

function urlWithCursor(q: AuditQuery, cursor: string): string {
  const params = new URLSearchParams();
  if (q.actor) params.set("actor", q.actor);
  if (q.action) params.set("action", q.action);
  if (q.target) params.set("target", q.target);
  if (q.from) params.set("from", q.from.toISOString().slice(0, 10));
  if (q.to) params.set("to", q.to.toISOString().slice(0, 10));
  params.set("cursor", cursor);
  return `?${params.toString()}`;
}

function exportUrl(q: AuditQuery): string {
  const params = new URLSearchParams();
  if (q.actor) params.set("actor", q.actor);
  if (q.action) params.set("action", q.action);
  if (q.target) params.set("target", q.target);
  if (q.from) params.set("from", q.from.toISOString().slice(0, 10));
  if (q.to) params.set("to", q.to.toISOString().slice(0, 10));
  const qs = params.toString();
  return `/api/admin/audit/export${qs ? `?${qs}` : ""}`;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  // Re-check auth on every render. The layout already gates, but the
  // audit surface is sensitive enough that a layer of defence here is
  // cheap.
  const actor = await requireUser();
  if (!actor.roles.includes("super_admin")) redirect("/");

  const q = parseAuditQuery(searchParams ?? {});
  const result = await runAuditQuery(prisma, q);

  // Map raw rows to the view shape the island expects. Deep-links go to
  // /admin/console/users/<id> for users and /practices/<id> for
  // practices (the routes the rest of the super-admin shell already
  // uses). The audit table doesn't try to be cleverer than that — a
  // dead deep-link is better than a wrong one.
  const viewRows: AuditRowView[] = result.rows.map((r) => {
    const subjectLooksLikeUser = r.subjectType === "user";
    return {
      id: r.id,
      at: r.at,
      atRelative: relativeTime(r.at),
      actorLabel: r.actorEmail ?? r.actorUserId,
      actorHref: `/admin/console/users/${encodeURIComponent(r.actorUserId)}`,
      action: r.action,
      subjectLabel: r.subjectId,
      subjectHref: subjectLooksLikeUser
        ? `/admin/console/users/${encodeURIComponent(r.subjectId)}`
        : null,
      targetLabel: r.organizationId ?? "—",
      targetHref: r.organizationId
        ? `/practices/${encodeURIComponent(r.organizationId)}`
        : null,
      metadataPreview: metadataPreview(r.after ?? r.before),
      metadataFullJson: JSON.stringify(
        { before: r.before, after: r.after, reason: r.reason },
        null,
        2,
      ),
    };
  });

  // Build the filter-chip set. Each chip is a link that removes its
  // filter from the URL. Clear-all sits next to the chips when any
  // filter is active.
  const activeChips: Array<{ label: string; href: string }> = [];
  if (q.actor) {
    activeChips.push({ label: `actor: ${q.actor}`, href: urlWithout(q, "actor") });
  }
  if (q.action) {
    activeChips.push({ label: `action: ${q.action}`, href: urlWithout(q, "action") });
  }
  if (q.target) {
    activeChips.push({ label: `target: ${q.target}`, href: urlWithout(q, "target") });
  }
  if (q.from) {
    activeChips.push({
      label: `from: ${q.from.toISOString().slice(0, 10)}`,
      href: urlWithout(q, "from"),
    });
  }
  if (q.to) {
    activeChips.push({
      label: `to: ${q.to.toISOString().slice(0, 10)}`,
      href: urlWithout(q, "to"),
    });
  }

  return (
    <PageShell>
      <Breadcrumbs
        items={[
          { label: "HQ", href: "/admin/hq" },
          { label: "Audit" },
          { label: "Audit log" },
        ]}
      />
      <PageHeader
        eyebrow="Internal"
        title="Audit log"
        description="Every controller mutation across every practice. Filter, expand, export."
        actions={
          <a
            href={exportUrl(q)}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/40"
          >
            Export CSV
          </a>
        }
      />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1" htmlFor="audit-filter-actor">
            Actor
          </label>
          <input
            id="audit-filter-actor"
            name="actor"
            type="text"
            defaultValue={q.actor ?? ""}
            placeholder="userId or email"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1" htmlFor="audit-filter-action">
            Action
          </label>
          <input
            id="audit-filter-action"
            name="action"
            type="text"
            defaultValue={q.action ?? ""}
            placeholder="contains…"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1" htmlFor="audit-filter-target">
            Target
          </label>
          <input
            id="audit-filter-target"
            name="target"
            type="text"
            defaultValue={q.target ?? ""}
            placeholder="practiceId or subjectId"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1" htmlFor="audit-filter-from">
            From
          </label>
          <input
            id="audit-filter-from"
            name="from"
            type="date"
            defaultValue={q.from ? q.from.toISOString().slice(0, 10) : ""}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1" htmlFor="audit-filter-to">
            To
          </label>
          <input
            id="audit-filter-to"
            name="to"
            type="date"
            defaultValue={q.to ? q.to.toISOString().slice(0, 10) : ""}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
        >
          Apply
        </button>
      </form>

      {activeChips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          {activeChips.map((chip) => (
            <a
              key={chip.label}
              href={chip.href}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-1 hover:bg-muted/60"
            >
              {chip.label}
              <span aria-hidden="true">×</span>
            </a>
          ))}
          <a href="?" className="text-text-muted underline">
            Clear all
          </a>
        </div>
      )}

      <AuditTableIsland
        rows={viewRows}
        emptyState={
          <div className="rounded-md border border-dashed border-border px-6 py-12 text-center">
            <p className="text-sm text-text-muted">
              No audit rows match the current filters.
            </p>
          </div>
        }
      />

      {result.nextCursor && (
        <div className="mt-4">
          <a
            href={urlWithCursor(q, result.nextCursor)}
            className="text-sm text-accent underline"
          >
            Load more →
          </a>
        </div>
      )}
    </PageShell>
  );
}

// Tiny helper used in tests to mirror page-side cursor URL construction
// without re-implementing it. Not part of the page render path.
export const _internals = { encodeCursor };
