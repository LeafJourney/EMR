// EMR-747 — Audit log row detail (drill-in).
//
// Server component. Given an audit row id, render:
//
//   - A header with the humanised action, exact timestamp, actor
//     (email + roles), and the operator-supplied `reason` if any.
//   - A before/after JSON diff rendered by the shared `DiffViewer`
//     primitive (src/components/ui/diff-viewer). The diff engine itself
//     lives in src/lib/ui/diff-engine and is unit-tested independently
//     so the page can stay a thin server component.
//   - A "Subject" panel that resolves subjectType/subjectId to the
//     real entity name when possible (User by id/email, Organization
//     by id), with a link back to that entity's super-admin surface.
//   - "Related actions": the last 5 ControllerAuditLog rows that share
//     this row's `subjectId`, each linking to its own detail page.
//
// Auth: the super-admin layout above us already runs requireSuperAdmin();
// we re-check here as defence-in-depth because the audit surface is the
// sensitive one. Following the same belt-and-braces pattern as the list
// page in ../page.tsx.
//
// We do NOT write a fresh audit row for *reading* this page — same
// reasoning as the list page (would create a feedback loop in the
// activity feed every time anyone clicked through).

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { PageShell } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/badge";
import { DiffViewer } from "@/components/ui/diff-viewer";
import { Eyebrow } from "@/components/ui/ornament";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/rbac/roles";
import { diffJson, summarizeJsonDiff } from "@/lib/ui/diff-engine";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Audit row — Leafjourney",
};

/**
 * Humanise a dot-namespaced action key for the header. The audit log
 * stores keys like "controller.config.publish" — split on dots and
 * title-case the last two segments so the operator sees
 * "Config publish" without losing the namespace context.
 */
function humanizeAction(action: string): string {
  const parts = action.split(".");
  const tail = parts.slice(-2).join(" ");
  if (!tail) return action;
  return tail.charAt(0).toUpperCase() + tail.slice(1).replace(/_/g, " ");
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

/** Resolve the subject entity to a display name + drill-in href. */
async function resolveSubject(
  subjectType: string,
  subjectId: string,
): Promise<{ label: string; href: string | null; kind: string } | null> {
  // Cheapest checks first; bail early when we don't know how to resolve
  // the type. The audit log uses "controller" as the default subjectType,
  // which we currently treat as a free-form id (no resolver yet).
  if (subjectType === "user") {
    const u = await prisma.user.findUnique({
      where: { id: subjectId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!u) return null;
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
    return {
      label: name ? `${name} <${u.email}>` : u.email,
      href: null, // no /admin/console/users/[id] page exists yet
      kind: "User",
    };
  }
  if (subjectType === "organization" || subjectType === "practice") {
    const o = await prisma.organization.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, slug: true },
    });
    if (!o) return null;
    return {
      label: o.name,
      href: `/practices/${encodeURIComponent(o.id)}`,
      kind: "Organization",
    };
  }
  return null;
}

export default async function AuditRowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireUser();
  if (!actor.roles.includes("super_admin")) redirect("/");

  const { id } = await params;

  const row = await prisma.controllerAuditLog.findUnique({
    where: { id },
  });

  if (!row) {
    notFound();
  }

  // Related rows: same subject, most recent 6 (we drop the current one
  // and show 5). subjectId is indexed on this table so the lookup is
  // cheap even on large audit tables.
  const relatedRaw = await prisma.controllerAuditLog.findMany({
    where: { subjectId: row.subjectId, id: { not: row.id } },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: 5,
    select: {
      id: true,
      at: true,
      action: true,
      actorEmail: true,
      actorUserId: true,
    },
  });

  const subjectResolved = await resolveSubject(row.subjectType, row.subjectId);

  // Use the shared diff engine (src/lib/ui/diff-engine) so this surface
  // stays visually identical to the practice config history and any
  // other before/after surface. The DiffViewer component renders the
  // full split/inline UI; here we just need totals for the header chip.
  const jsonEntries = diffJson(row.before, row.after);
  const summary = summarizeJsonDiff(jsonEntries);
  const totalChanged = summary.added + summary.removed + summary.changed;

  const actorRoleLabels = (row.actorRoles as string[]).map(
    (r) => ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r,
  );

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <div className="mb-6">
        <Link
          href="/admin/audit"
          className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Audit log
        </Link>
      </div>

      <div className="flex flex-col gap-5 mb-8">
        <Eyebrow>Audit row</Eyebrow>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
              {humanizeAction(row.action)}
            </h1>
            <div className="text-[13px] font-mono text-text-muted mt-1.5">
              {row.action}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <Badge tone="neutral">{formatTimestamp(row.at.toISOString())}</Badge>
              {actorRoleLabels.map((label) => (
                <Badge key={label} tone="accent">
                  {label}
                </Badge>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-text-muted">
              Row id
            </div>
            <div className="font-mono text-xs text-text mt-1 break-all">
              {row.id}
            </div>
          </div>
        </div>
      </div>

      {/* Actor + reason */}
      <section className="rounded-xl border border-border bg-background/50 p-5 mb-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-muted mb-1">
              Actor
            </div>
            <div className="text-sm text-text">
              {row.actorEmail ?? <span className="text-text-muted">—</span>}
            </div>
            <div className="font-mono text-[11px] text-text-muted mt-0.5 break-all">
              {row.actorUserId}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-muted mb-1">
              Organization
            </div>
            <div className="text-sm text-text">
              {row.organizationId ? (
                <Link
                  href={`/practices/${encodeURIComponent(row.organizationId)}`}
                  className="text-accent underline"
                >
                  {row.organizationId}
                </Link>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-muted mb-1">
              Reason
            </div>
            <div className="text-sm text-text whitespace-pre-wrap">
              {row.reason ?? <span className="text-text-muted">—</span>}
            </div>
          </div>
        </div>
      </section>

      {/* Subject panel */}
      <section className="rounded-xl border border-border bg-background/50 p-5 mb-6">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-muted">
              Subject
            </div>
            <div className="text-sm text-text mt-1">
              <span className="font-mono text-xs mr-2">{row.subjectType}</span>
              <span className="font-mono text-xs text-text-muted">{row.subjectId}</span>
            </div>
          </div>
          {subjectResolved ? (
            <div className="text-right">
              <Badge tone="info">{subjectResolved.kind}</Badge>
              <div className="text-sm text-text mt-1">
                {subjectResolved.href ? (
                  <Link
                    href={subjectResolved.href}
                    className="text-accent underline"
                  >
                    {subjectResolved.label}
                  </Link>
                ) : (
                  subjectResolved.label
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-text-muted">
              No resolver for this subject type yet.
            </div>
          )}
        </div>
      </section>

      {/* Before / After diff */}
      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-xl text-text">Diff</h2>
          <div className="text-xs text-text-muted">
            {totalChanged === 0 ? (
              <span>No top-level changes detected.</span>
            ) : (
              <span>
                <span className="text-emerald-700 dark:text-emerald-300">
                  +{summary.added}
                </span>{" "}
                <span className="text-rose-700 dark:text-rose-300">
                  −{summary.removed}
                </span>{" "}
                <span className="text-amber-700 dark:text-amber-300">
                  ~{summary.changed}
                </span>{" "}
                </span>
            )}
          </div>
        </div>

        <DiffViewer
          left={row.before}
          right={row.after}
          format="json"
          leftLabel="Before"
          rightLabel="After"
        />


        <details className="mt-4 rounded-xl border border-border bg-muted/20">
          <summary className="cursor-pointer px-3 py-2 text-[12px] text-text-muted hover:text-text">
            Show raw before / after JSON
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-t border-border">
            <pre className="px-3 py-3 text-xs font-mono whitespace-pre-wrap break-all border-r border-border">
              {JSON.stringify(row.before, null, 2) ?? "null"}
            </pre>
            <pre className="px-3 py-3 text-xs font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(row.after, null, 2) ?? "null"}
            </pre>
          </div>
        </details>
      </section>

      {/* Related rows */}
      <section className="mb-6">
        <h2 className="font-display text-xl text-text mb-3">Related actions</h2>
        {relatedRaw.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-8 text-center text-sm text-text-muted">
            No other audit rows touch this subject.
          </div>
        ) : (
          <ul className="grid gap-2">
            {relatedRaw.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 px-4 py-3 text-sm hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/audit/${encodeURIComponent(r.id)}`}
                    className="font-mono text-xs text-accent underline"
                  >
                    {r.action}
                  </Link>
                  <div className="text-[11px] text-text-muted mt-0.5 truncate">
                    {r.actorEmail ?? r.actorUserId}
                  </div>
                </div>
                <div className="text-[11px] text-text-muted shrink-0">
                  {formatTimestamp(r.at.toISOString())}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
