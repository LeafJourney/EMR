// EMR-755 — Per-practice Costs tab.
//
// Drill-in surface that shows the per-practice AI cost picture:
//   - MTD token usage (sum of LlmUsage rows for this practice when the
//     model is generated; today we surface zeros so the layout is right
//     and the source of truth is documented in the empty-state copy).
//   - Included monthly allowance from PracticeSubscription.
//   - Projected overage (linear forecast through end of month).
//   - Throttle state (matches the EMR-756 broker short-circuit).
//
// Server component. Reads PracticeSubscription directly; LlmUsage rows
// are fed by EMR-754 broker recordLlmUsage() once that Prisma model
// lands. Today recordLlmUsage emits structured logs, so the column
// renders 0 with an explanatory empty state.

import { prisma } from "@/lib/db/prisma";
import { formatUSDCents } from "../../admin/hq/tiles/format";
import { decideGuardrailStatus } from "@/lib/billing/cost-guardrails";

const NUMBER_FMT = new Intl.NumberFormat("en-US");

function daysInCurrentMonth(now: Date): number {
  return new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
}

async function loadCostsSnapshot(organizationId: string): Promise<{
  tier: string | null;
  includedMonthlyTokens: number | null;
  monthlyRevenueCents: number;
  throttled: boolean;
  usedTokensMTD: number;
  projectedTokens: number;
}> {
  // PracticeSubscription delegate may not be generated yet in some envs
  // (EMR-751 just added it). Probe at runtime.
  const delegate = (prisma as unknown as Record<string, unknown>)[
    "practiceSubscription"
  ] as
    | undefined
    | {
        findUnique: (args: {
          where: { organizationId: string };
          select: {
            tier: true;
            includedMonthlyTokens: true;
            monthlyRevenueCents: true;
            throttled: true;
          };
        }) => Promise<{
          tier: string;
          includedMonthlyTokens: number | null;
          monthlyRevenueCents: number;
          throttled: boolean;
        } | null>;
      };

  const sub = delegate
    ? await delegate
        .findUnique({
          where: { organizationId },
          select: {
            tier: true,
            includedMonthlyTokens: true,
            monthlyRevenueCents: true,
            throttled: true,
          },
        })
        .catch(() => null)
    : null;

  const usedTokensMTD = 0; // TODO(EMR-755 follow-up): aggregate LlmUsage.

  const now = new Date();
  const day = Math.max(1, now.getUTCDate());
  const total = daysInCurrentMonth(now);
  const projectedTokens = Math.round((usedTokensMTD / day) * total);

  return {
    tier: sub?.tier ?? null,
    includedMonthlyTokens: sub?.includedMonthlyTokens ?? null,
    monthlyRevenueCents: sub?.monthlyRevenueCents ?? 0,
    throttled: sub?.throttled ?? false,
    usedTokensMTD,
    projectedTokens,
  };
}

export async function CostsTab({
  organizationId,
}: {
  organizationId: string;
}) {
  const snap = await loadCostsSnapshot(organizationId);
  const guardrail = decideGuardrailStatus({
    usedTokensMTD: snap.usedTokensMTD,
    includedMonthlyTokens: snap.includedMonthlyTokens,
  });

  const projectedOverage =
    snap.includedMonthlyTokens != null
      ? Math.max(0, snap.projectedTokens - snap.includedMonthlyTokens)
      : null;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Tier"
          value={snap.tier ?? "—"}
          subtitle={
            snap.monthlyRevenueCents > 0
              ? `${formatUSDCents(snap.monthlyRevenueCents)} / mo`
              : "no subscription on file"
          }
        />
        <StatTile
          label="Tokens MTD"
          value={NUMBER_FMT.format(snap.usedTokensMTD)}
          subtitle={
            snap.includedMonthlyTokens != null
              ? `of ${NUMBER_FMT.format(snap.includedMonthlyTokens)} included`
              : "no allowance configured"
          }
        />
        <StatTile
          label="Projected end-of-month"
          value={NUMBER_FMT.format(snap.projectedTokens)}
          subtitle={
            projectedOverage != null && projectedOverage > 0
              ? `${NUMBER_FMT.format(projectedOverage)} over allowance`
              : "within allowance"
          }
          tone={projectedOverage != null && projectedOverage > 0 ? "warn" : "ok"}
        />
        <StatTile
          label="Status"
          value={guardrail.status.replace(/_/g, " ")}
          subtitle={
            snap.throttled
              ? "broker is short-circuiting calls"
              : "broker is serving calls"
          }
          tone={snap.throttled ? "danger" : guardrail.status === "ok" ? "ok" : "warn"}
        />
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-border bg-surface-muted/30 p-4 text-[12px] text-text-muted">
        Token figures are populated from the LlmUsage feed written by the
        EMR-754 broker. Until that Prisma model lands the broker emits a
        structured <code>llm.usage</code> log per call and this tab shows
        zeros — the layout, guardrail logic, and operator override paths
        are already live.
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  subtitle,
  tone = "ok",
}: {
  label: string;
  value: string;
  subtitle: string;
  tone?: "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-300/70 bg-red-50/30"
      : tone === "warn"
        ? "border-amber-300/70 bg-amber-50/30"
        : "border-border bg-surface";
  return (
    <div className={`rounded-2xl border ${toneClass} px-5 py-4`}>
      <div className="text-[11px] uppercase tracking-[0.14em] text-text-subtle">
        {label}
      </div>
      <div className="font-display text-2xl text-text tracking-tight tabular-nums mt-2 leading-none">
        {value}
      </div>
      <div className="mt-2 text-[11px] text-text-muted">{subtitle}</div>
    </div>
  );
}
