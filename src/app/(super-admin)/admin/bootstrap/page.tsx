// EMR-726 — Bootstrap allowlist UI.
//
// Server component. Already gated by (super-admin)/layout.tsx, so we don't
// re-check role here. Two sections:
//   1. Current allowlist (parsed env), with per-email "promoted?" status
//      cross-referenced against Membership rows where role = super_admin.
//   2. History of BootstrapAllowlistSnapshot rows, most recent 50, with
//      added/removed diffs computed against the prior row.

import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Breadcrumbs } from "@/components/super-admin/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/ornament";
import { prisma } from "@/lib/db/prisma";
import {
  diffAllowlists,
  normaliseAllowlist,
} from "@/lib/auth/bootstrap-audit";

export const metadata: Metadata = {
  title: "Bootstrap allowlist — Leafjourney HQ",
};

export const dynamic = "force-dynamic";

interface SnapshotRow {
  id: string;
  hash: string;
  emails: string[];
  deploySha: string | null;
  createdAt: Date;
}

interface SnapshotWithDiff extends SnapshotRow {
  added: string[];
  removed: string[];
}

async function loadSnapshots(): Promise<SnapshotWithDiff[]> {
  // Pull 51 so we can diff the oldest visible row against the row just
  // before it (otherwise the bottom row would always look empty).
  const rows = await prisma.bootstrapAllowlistSnapshot.findMany({
    orderBy: { createdAt: "desc" },
    take: 51,
    select: {
      id: true,
      hash: true,
      emails: true,
      deploySha: true,
      createdAt: true,
    },
  });

  const out: SnapshotWithDiff[] = [];
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const curr = rows[i]!;
    const prev = rows[i + 1] ?? null;
    const { added, removed } = prev
      ? diffAllowlists(prev.emails, curr.emails)
      : { added: curr.emails, removed: [] };
    out.push({ ...curr, added, removed });
  }
  return out;
}

async function loadPromotedEmails(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const memberships = await prisma.membership.findMany({
    where: {
      role: "super_admin",
      user: { email: { in: emails, mode: "insensitive" } },
    },
    select: { user: { select: { email: true } } },
  });
  return new Set(memberships.map((m) => m.user.email.toLowerCase()));
}

export default async function BootstrapAllowlistPage() {
  const currentEmails = normaliseAllowlist(
    process.env.SUPER_ADMIN_BOOTSTRAP_EMAILS,
  );
  const isEnabled = process.env.SUPER_ADMIN_BOOTSTRAP_ENABLED === "1";
  const isProd = process.env.NODE_ENV === "production";

  const [snapshots, promoted] = await Promise.all([
    loadSnapshots(),
    loadPromotedEmails(currentEmails),
  ]);

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <Breadcrumbs
        items={[
          { label: "HQ", href: "/admin/hq" },
          { label: "Security" },
          { label: "Bootstrap allowlist" },
        ]}
      />
      <PageHeader
        eyebrow="Leafjourney HQ"
        title="Bootstrap allowlist"
        description="The SUPER_ADMIN_BOOTSTRAP_EMAILS allowlist controls who can lazy-promote into the super_admin role. Rotations between deploys are detected automatically and recorded here."
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Current allowlist</CardTitle>
            <div className="mt-2 flex items-center gap-2 text-[12px] text-text-muted">
              <StatusBadge
                ok={isEnabled || !isProd}
                label={
                  isEnabled
                    ? "Bootstrap enabled"
                    : isProd
                      ? "Bootstrap disabled in production"
                      : "Bootstrap permitted (non-production)"
                }
              />
              <span aria-hidden>·</span>
              <span>
                {currentEmails.length}{" "}
                {currentEmails.length === 1 ? "address" : "addresses"}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {currentEmails.length === 0 ? (
              <p className="text-sm text-text-muted">
                The allowlist is empty. No lazy promotion will occur.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {currentEmails.map((email) => {
                  const isPromoted = promoted.has(email);
                  return (
                    <li
                      key={email}
                      className="flex items-center justify-between py-2.5"
                    >
                      <span className="font-mono text-[13px] text-text">
                        {email}
                      </span>
                      <StatusBadge
                        ok={isPromoted}
                        label={isPromoted ? "Promoted" : "Pending sign-in"}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change history</CardTitle>
            <p className="text-sm text-text-muted mt-1">
              One row per observed rotation between deploys. Reboots with the
              same allowlist produce no row.
            </p>
          </CardHeader>
          <CardContent>
            {snapshots.length === 0 ? (
              <p className="text-sm text-text-muted">
                No snapshots yet — the first server boot will record a
                baseline.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-border/60">
                      <Th>Recorded</Th>
                      <Th>Deploy</Th>
                      <Th>Added</Th>
                      <Th>Removed</Th>
                      <Th>Hash</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border/40 align-top"
                      >
                        <Td>{formatDate(row.createdAt)}</Td>
                        <Td className="font-mono text-[12px]">
                          {row.deploySha ? shortSha(row.deploySha) : "—"}
                        </Td>
                        <Td>
                          <DiffList items={row.added} tone="add" />
                        </Td>
                        <Td>
                          <DiffList items={row.removed} tone="remove" />
                        </Td>
                        <Td className="font-mono text-[11px] text-text-muted">
                          {row.hash.slice(0, 12)}…
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card tone="outlined">
          <CardContent className="py-5">
            <Eyebrow className="mb-2">Rotation runbook</Eyebrow>
            <ol className="text-sm text-text-muted space-y-1.5 list-decimal pl-5">
              <li>
                Update <code>SUPER_ADMIN_BOOTSTRAP_EMAILS</code> in Render
                (comma-separated).
              </li>
              <li>
                Trigger a redeploy. The boot-audit path writes a snapshot
                row and an error-level log line if the allowlist changed.
              </li>
              <li>
                Have the new admin sign in once to receive the role.
              </li>
              <li>
                Unset <code>SUPER_ADMIN_BOOTSTRAP_ENABLED</code> and
                redeploy to close the bootstrap path.
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium " +
        (ok
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-300")
      }
    >
      <span
        aria-hidden
        className={
          "h-1.5 w-1.5 rounded-full " +
          (ok ? "bg-emerald-500" : "bg-amber-500")
        }
      />
      {label}
    </span>
  );
}

function DiffList({
  items,
  tone,
}: {
  items: string[];
  tone: "add" | "remove";
}) {
  if (items.length === 0) {
    return <span className="text-text-muted">—</span>;
  }
  return (
    <ul className="space-y-0.5">
      {items.map((email) => (
        <li
          key={email}
          className={
            "font-mono text-[12px] " +
            (tone === "add"
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-rose-700 dark:text-rose-300")
          }
        >
          {tone === "add" ? "+" : "−"} {email}
        </li>
      ))}
    </ul>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-[11px] uppercase tracking-wider text-text-muted font-medium pb-2 pr-4">
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={"py-3 pr-4 " + (className ?? "")}>{children}</td>;
}

function shortSha(sha: string): string {
  return sha.length > 8 ? sha.slice(0, 8) : sha;
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
