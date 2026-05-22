"use client";

// EMR-744 — 24h activity stream client island.
//
// Only client-rendered piece of the HQ dashboard. Owns the auto-refresh
// timer so the rest of the page stays a pure server render: we call
// `router.refresh()` every 30s which re-runs the parent server component
// (this island is replaced with the new server-rendered rows, so the
// timer survives because React reconciles the same component instance).
//
// The 30s cadence is intentionally above the 60s loader cache TTL — most
// refreshes are cheap re-reads from the cache, with a real DB hit at
// most twice per minute fleet-wide.

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { RecentActivityRow } from "../types";
import { formatRelativeTime } from "./format";

const REFRESH_INTERVAL_MS = 30_000;

export function ActivityStream({ rows }: { rows: RecentActivityRow[] }) {
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [router]);

  if (rows.length === 0) {
    return (
      <div className="py-2">
        <p className="text-sm text-text">All quiet.</p>
        <p className="mt-1.5 text-[12px] text-text-muted leading-snug max-w-md">
          No super-admin actions in the last 24 hours. Every privileged action across the fleet shows up here in near-real-time.
        </p>
        <Link
          href="/admin/audit"
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.14em] text-accent hover:underline focus:outline-none focus-visible:underline rounded"
        >
          Browse full audit log <span aria-hidden="true">→</span>
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="grid grid-cols-[1fr_auto] items-baseline gap-3 px-2 py-1.5 -mx-2 rounded-lg hover:bg-surface-muted/40 transition-colors"
        >
          <div className="min-w-0">
            <Link
              href={row.deeplink}
              className="text-sm text-text hover:text-accent transition-colors focus:outline-none focus-visible:underline"
            >
              <span className="font-mono text-[12px] text-text-subtle mr-2">
                {row.action}
              </span>
              <span className="truncate">
                {row.actorEmail ?? row.actorUserId}
                {row.organizationId ? <> · org <code className="text-[12px]">{row.organizationId}</code></> : null}
              </span>
            </Link>
          </div>
          <time
            dateTime={row.at}
            className="text-[11px] text-text-subtle tabular-nums whitespace-nowrap"
          >
            {formatRelativeTime(row.at)}
          </time>
        </li>
      ))}
      <li className="pt-2">
        <Link
          href="/admin/audit"
          className="text-[12px] uppercase tracking-[0.14em] text-text-subtle hover:text-text transition-colors"
        >
          Show all activity →
        </Link>
      </li>
    </ul>
  );
}
