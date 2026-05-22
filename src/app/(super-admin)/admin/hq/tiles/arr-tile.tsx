// EMR-753 — MRR / ARR / churn tile.
//
// Replaces the ARR placeholder in revenue-strip.tsx with a tile sourced
// from PracticeSubscription aggregates ([[EMR-751]]):
//   - MRR sum  (active+trialing subscriptions, monthlyRevenueCents)
//   - ARR      (MRR * 12)
//   - Churn    (super_admin.subscription_change audits in the last 90d
//              with reason starting "canceled_")
//
// Server component. Reads directly from Prisma; the page that hosts the
// tile is already a server component and the query is bounded.

import { prisma } from "@/lib/db/prisma";
import { formatUSDCents } from "./format";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

async function loadArrSnapshot(): Promise<{
  mrrCents: number;
  arrCents: number;
  activeCount: number;
  churn90d: { canceled: number; total: number; rate: number };
}> {
  const since = new Date(Date.now() - NINETY_DAYS_MS);

  const [active, canceled90d, audits90d] = await Promise.all([
    prisma.practiceSubscription.aggregate({
      _sum: { monthlyRevenueCents: true },
      _count: { _all: true },
      where: { status: { in: ["active", "trialing"] } },
    }),
    prisma.controllerAuditLog.count({
      where: {
        action: "super_admin.subscription_change",
        reason: { startsWith: "canceled_" },
        at: { gte: since },
      },
    }),
    prisma.controllerAuditLog.count({
      where: {
        action: "super_admin.subscription_change",
        at: { gte: since },
      },
    }),
  ]);

  const mrrCents = active._sum.monthlyRevenueCents ?? 0;
  const total = audits90d;
  const rate = total > 0 ? canceled90d / total : 0;

  return {
    mrrCents,
    arrCents: mrrCents * 12,
    activeCount: active._count._all,
    churn90d: { canceled: canceled90d, total, rate },
  };
}

export async function ArrTile() {
  const snap = await loadArrSnapshot();
  const empty = snap.activeCount === 0;

  if (empty) {
    return (
      <div
        tabIndex={0}
        className="block rounded-2xl border border-dashed border-border-strong/60 bg-surface-muted/30 px-7 py-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="ARR — no active subscriptions yet"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">
            ARR
          </div>
        </div>
        <div className="font-display text-3xl md:text-4xl text-text-muted tracking-tight tabular-nums mt-4 leading-none">
          $0
        </div>
        <div className="mt-3 text-[11px] text-text-subtle leading-snug">
          No active subscriptions yet. Will populate from PracticeSubscription
          rows.
        </div>
      </div>
    );
  }

  const churnPct = (snap.churn90d.rate * 100).toFixed(1);

  return (
    <div
      tabIndex={0}
      className="group relative block rounded-2xl border border-border/70 bg-surface px-7 py-6 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      title={`MRR: ${formatUSDCents(snap.mrrCents)} · Active: ${snap.activeCount}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">
          ARR
        </div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-text-subtle tabular-nums">
          {snap.activeCount} active
        </div>
      </div>
      <div className="font-display text-3xl md:text-4xl text-text tracking-tight tabular-nums mt-4 leading-none">
        {formatUSDCents(snap.arrCents)}
      </div>
      <div className="mt-3 text-[11px] text-text-subtle leading-snug">
        MRR {formatUSDCents(snap.mrrCents)} · 90d churn {churnPct}%
      </div>
    </div>
  );
}
