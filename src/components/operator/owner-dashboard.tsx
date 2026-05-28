"use client";

import * as React from "react";
import { KpiCard, type KpiSeverity, type KpiTrend } from "./kpi-card";
import { OwnerDashboardDensityFrame } from "./owner-dashboard-density-frame";
import {
  computeTrend,
  denialSeverity,
  arSeverity,
  type OwnerKpiSnapshot,
} from "@/lib/domain/owner-kpi-helpers";
import { formatMoneyCompact, formatMoney } from "@/lib/utils/format";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Card, CardContent } from "@/components/ui/card";
import { TrendArea } from "@/components/charts";

// ---------------------------------------------------------------------------
// OwnerDashboard — composes the 6 KPI tiles in a 1/2/3-column grid.
//
// The render is purely a function of an OwnerKpiSnapshot. The snapshot
// itself is loaded by the page in a single Promise.all upstream; this
// component does no I/O.
// ---------------------------------------------------------------------------

export interface OwnerDashboardProps {
  snapshot: OwnerKpiSnapshot;
  hasPracticeManagerAgent?: boolean;
}

export function OwnerDashboard({ snapshot, hasPracticeManagerAgent = true }: OwnerDashboardProps) {
  // ---------- 1. Revenue this week ----------
  const revenueTrend = computeTrend(
    snapshot.revenueThisWeekCents,
    snapshot.revenuePriorWeekCents,
  );
  const revenueCard = {
    eyebrow: "Revenue this week",
    // Animate revenue from prior-week → this-week so the tile feels alive
    // on refresh. We format the *interpolated* cents value with the same
    // compact-money helper used everywhere else for consistency.
    headline: (
      <AnimatedNumber
        value={snapshot.revenueThisWeekCents}
        format={(n) => formatMoneyCompact(Math.round(n))}
      />
    ),
    headlineLabel: formatMoneyCompact(snapshot.revenueThisWeekCents),
    subtext:
      snapshot.revenuePriorWeekCents > 0
        ? `${formatMoneyCompact(snapshot.revenuePriorWeekCents)} prior 7 days`
        : "No revenue in the prior 7 days",
    href: "/ops/revenue",
    trend: {
      direction: revenueTrend.direction,
      percent: revenueTrend.percent,
      goodWhen: "up",
    } as KpiTrend,
  };

  // ---------- 2. Denials queue ----------
  const denialsSev: KpiSeverity = denialSeverity(snapshot.denials);
  const denialsCard = {
    eyebrow: "Denials queue",
    headline: <AnimatedNumber value={snapshot.denials.unresolvedCount} />,
    headlineLabel: snapshot.denials.unresolvedCount.toString(),
    subtext:
      snapshot.denials.unresolvedCount === 0
        ? "All denials resolved"
        : snapshot.denials.oldestDays !== null
          ? `oldest ${snapshot.denials.oldestDays}d`
          : "Awaiting triage",
    href: "/ops/denials",
    severity: denialsSev,
  };

  // ---------- 3. Schedule fill rate ----------
  const fillPct = snapshot.scheduleFillPct;
  const scheduleCard = {
    eyebrow: "Schedule fill",
    headline: fillPct === null ? "\u2014" : `${fillPct}%`,
    subtext:
      fillPct === null
        ? "No active providers configured"
        : `${snapshot.visitsToday} visits today, ${snapshot.openSlotsToday} open slots`,
    href: "/ops/schedule",
  };

  // ---------- 4. Agent fleet status ----------
  // EMR-795: the headline count is driven by AgentJob rows in the DB
  // (see `loadAgents` in owner-kpis.ts), so newly-registered agent
  // classes are discovered automatically as soon as they record jobs.
  // No tile-side wiring is needed for the new Practice Manager Agent
  // beyond surfacing its presence via the sub-label below.
  const baseAgentSubtext = `${snapshot.agents.running} processing, ${snapshot.agents.completedToday} completed today`;
  const agentsCard = {
    eyebrow: "Agent fleet",
    headline: <AnimatedNumber value={snapshot.agents.running} />,
    headlineLabel: snapshot.agents.running.toString(),
    subtext: hasPracticeManagerAgent
      ? `${baseAgentSubtext} • incl. Practice Manager`
      : baseAgentSubtext,
    href: "/ops/agents",
    pulse: snapshot.agents.running > 0,
  };

  // ---------- 5. New patients this week ----------
  const patientsTrend = computeTrend(
    snapshot.newPatientsThisWeek,
    snapshot.newPatientsPriorWeek,
  );
  const patientsCard = {
    eyebrow: "New patients (7d)",
    headline: <AnimatedNumber value={snapshot.newPatientsThisWeek} />,
    headlineLabel: snapshot.newPatientsThisWeek.toString(),
    subtext:
      snapshot.newPatientsPriorWeek > 0
        ? `${snapshot.newPatientsPriorWeek} in the prior 7 days`
        : "No new patients in the prior 7 days",
    href: "/ops/patients",
    trend: {
      direction: patientsTrend.direction,
      percent: patientsTrend.percent,
      goodWhen: "up",
    } as KpiTrend,
  };

  // ---------- 6. AR aging ----------
  // We don't surface the oldest past-due day count separately, but the
  // severity tier uses the dollar threshold (>$10k) which is enough to
  // escalate. A future iteration can wire the oldestPastDueDays through.
  const arSev: KpiSeverity = arSeverity({
    arAgingCents: snapshot.arAgingCents,
    oldestPastDueDays: snapshot.arPastDueCount > 0 ? 31 : null,
  });
  const arCard = {
    eyebrow: "AR aging \u226530d",
    headline: formatMoney(snapshot.arAgingCents),
    subtext:
      snapshot.arPastDueCount === 0
        ? "Nothing past due"
        : `${snapshot.arPastDueCount} claim${snapshot.arPastDueCount === 1 ? "" : "s"} past due`,
    href: "/ops/aging",
    severity: arSev,
  };

  // Lightweight prior-vs-current week sparkline series. We don't have a true
  // day-by-day series at this layer (the upstream snapshot collapses to two
  // 7-day buckets) so we anchor a smooth ramp between the two so the trend
  // direction reads visually without inventing fake mid-week values.
  const revenueSpark = sparkBetween(
    snapshot.revenuePriorWeekCents,
    snapshot.revenueThisWeekCents,
  );
  const patientsSpark = sparkBetween(
    snapshot.newPatientsPriorWeek,
    snapshot.newPatientsThisWeek,
  );

  return (
    <OwnerDashboardDensityFrame>
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <Card tone="raised">
          <CardContent className="py-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
              Revenue · 7-day ramp
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Prior 7 days → this week, smoothed.
            </p>
            <div className="mt-3">
              <TrendArea
                data={revenueSpark}
                xKey="label"
                height={140}
                lines={[{ dataKey: "value", label: "Revenue" }]}
                emptyTitle="No revenue yet"
                emptyDescription="Revenue trend appears once claims start posting."
              />
            </div>
          </CardContent>
        </Card>
        <Card tone="raised">
          <CardContent className="py-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
              New patients · 7-day ramp
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Prior 7 days → this week.
            </p>
            <div className="mt-3">
              <TrendArea
                data={patientsSpark}
                xKey="label"
                height={140}
                lines={[
                  {
                    dataKey: "value",
                    label: "New patients",
                    color: "var(--accent)",
                  },
                ]}
                emptyTitle="No new patients yet"
                emptyDescription="The intake trend will appear once patients are added."
              />
            </div>
          </CardContent>
        </Card>
      </div>
      <KpiCard {...revenueCard} />
      <KpiCard {...denialsCard} />
      <KpiCard {...scheduleCard} />
      <KpiCard {...agentsCard} />
      <KpiCard {...patientsCard} />
      <KpiCard {...arCard} />
    </OwnerDashboardDensityFrame>
  );
}

/**
 * Synthesize a 7-point smooth ramp between two weekly totals. Returns an
 * empty array when both endpoints are zero so the chart shows EmptyState
 * instead of a flat line on a brand-new tenant.
 */
function sparkBetween(prior: number, current: number) {
  if (prior === 0 && current === 0) return [];
  const steps = 7;
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    // Smoothstep easing so the ramp doesn't read as a straight line.
    const eased = t * t * (3 - 2 * t);
    const v = prior + (current - prior) * eased;
    return { label: i === 0 ? "Prior wk" : i === steps - 1 ? "This wk" : "", value: Math.round(v) };
  });
}
