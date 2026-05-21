// EMR-746 — Semantic version diff viewer.
//
// /practices/[id]/history/diff?from=v3&to=v5
//
// Loads two PracticeConfigurationVersion rows by their version numbers
// and renders a semantic diff using the labelFor() map. Falls back to a
// raw-JSON view when a field has no humanizing label and isn't a flat
// scalar.
//
// Server component. Auth gating inherits from (super-admin)/layout.tsx.

import { notFound } from "next/navigation";
import Link from "next/link";

import { prisma } from "@/lib/db/prisma";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";
import { Breadcrumbs } from "@/components/super-admin/breadcrumbs";
import { Badge } from "@/components/ui/badge";

import { labelFor } from "@/lib/practice-config/labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuration diff — Leafjourney" };

function parseVersion(input: string | undefined): number | null {
  if (!input) return null;
  const trimmed = input.startsWith("v") ? input.slice(1) : input;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

type Snapshot = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Recursively collect leaf paths from a snapshot. */
function flatten(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (isPlainObject(value)) {
    const out: Array<[string, unknown]> = [];
    for (const k of Object.keys(value)) {
      out.push(...flatten(value[k], prefix ? `${prefix}.${k}` : k));
    }
    return out;
  }
  if (Array.isArray(value)) {
    return [[prefix, value]];
  }
  return [[prefix, value]];
}

interface DiffRow {
  path: string;
  label: string;
  before: unknown;
  after: unknown;
  kind: "added" | "removed" | "changed";
}

function computeDiff(before: Snapshot, after: Snapshot): DiffRow[] {
  const flatBefore = new Map(flatten(before));
  const flatAfter = new Map(flatten(after));
  const allPaths = Array.from(new Set([...flatBefore.keys(), ...flatAfter.keys()]));

  const rows: DiffRow[] = [];
  for (const path of allPaths.sort()) {
    const hasBefore = flatBefore.has(path);
    const hasAfter = flatAfter.has(path);
    const bv = flatBefore.get(path);
    const av = flatAfter.get(path);
    if (!hasBefore && hasAfter) {
      rows.push({ path, label: labelFor(path), before: undefined, after: av, kind: "added" });
    } else if (hasBefore && !hasAfter) {
      rows.push({ path, label: labelFor(path), before: bv, after: undefined, kind: "removed" });
    } else if (JSON.stringify(bv) !== JSON.stringify(av)) {
      rows.push({ path, label: labelFor(path), before: bv, after: av, kind: "changed" });
    }
  }
  return rows;
}

function formatValue(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value || '""';
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value.map((v) => formatValue(v)).join(", ");
  }
  return JSON.stringify(value);
}

export default async function PracticeConfigDiffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const fromVersion = parseVersion(sp.from);
  const toVersion = parseVersion(sp.to);

  if (!fromVersion || !toVersion) notFound();

  const config = await prisma.practiceConfiguration.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!config) notFound();

  const [fromRow, toRow] = await Promise.all([
    prisma.practiceConfigurationVersion.findFirst({
      where: { configurationId: id, version: fromVersion },
      select: { version: true, snapshot: true, publishedAt: true, publishedBy: true },
    }),
    prisma.practiceConfigurationVersion.findFirst({
      where: { configurationId: id, version: toVersion },
      select: { version: true, snapshot: true, publishedAt: true, publishedBy: true },
    }),
  ]);

  if (!fromRow || !toRow) notFound();

  const fromSnap = (fromRow.snapshot ?? {}) as Snapshot;
  const toSnap = (toRow.snapshot ?? {}) as Snapshot;
  const rows = computeDiff(fromSnap, toSnap);

  return (
    <PageShell maxWidth="max-w-[1080px]">
      <Breadcrumbs
        items={[
          { label: "HQ", href: "/admin/hq" },
          { label: "Operations" },
          { label: "Practices", href: "/practices" },
          { label: "Practice", href: `/practices/${id}` },
          { label: "History", href: `/practices/${id}?tab=history` },
          { label: `v${fromVersion} → v${toVersion}` },
        ]}
      />

      <Eyebrow>Configuration diff</Eyebrow>
      <h1 className="font-display text-2xl md:text-3xl text-text tracking-tight leading-[1.1] mt-2">
        v{fromVersion} → v{toVersion}
      </h1>
      <p className="text-[12px] text-text-muted mt-2">
        Published by {toRow.publishedBy} on{" "}
        {new Date(toRow.publishedAt).toLocaleString()}
      </p>

      <div className="flex items-center gap-2 my-5 text-[12px]">
        <Badge tone="success">{rows.filter((r) => r.kind === "added").length} added</Badge>
        <Badge tone="warning">{rows.filter((r) => r.kind === "changed").length} changed</Badge>
        <Badge tone="danger">{rows.filter((r) => r.kind === "removed").length} removed</Badge>
        <Link
          href={`/practices/${id}?tab=history`}
          className="ml-auto text-text-muted hover:text-text"
        >
          ← Back to history
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <div className="font-display text-base text-text tracking-tight">
            No semantic differences
          </div>
          <div className="mt-1.5 text-[12px] text-text-muted">
            v{fromVersion} and v{toVersion} are equivalent at the field level.
          </div>
        </div>
      ) : (
        <ol className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.path}
              className="rounded-lg border border-border/70 bg-surface px-4 py-3"
            >
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <div className="font-display text-[14px] text-text tracking-tight">
                  {row.label}
                </div>
                <Badge
                  tone={
                    row.kind === "added"
                      ? "success"
                      : row.kind === "removed"
                        ? "danger"
                        : "warning"
                  }
                >
                  {row.kind}
                </Badge>
              </div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2 text-[12px]">
                <div className="rounded-md border border-border/60 bg-surface-muted/40 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">
                    Before
                  </div>
                  <div className="font-mono text-text mt-1 whitespace-pre-wrap break-words">
                    {formatValue(row.before)}
                  </div>
                </div>
                <div className="rounded-md border border-border/60 bg-surface-muted/40 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">
                    After
                  </div>
                  <div className="font-mono text-text mt-1 whitespace-pre-wrap break-words">
                    {formatValue(row.after)}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-text-subtle font-mono">{row.path}</div>
            </li>
          ))}
        </ol>
      )}
    </PageShell>
  );
}
