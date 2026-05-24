import * as React from "react";
import { KpiCard, type KpiSeverity, type KpiTrend } from "./kpi-card";
import {
  computeTrend,
  denialSeverity,
  arSeverity,
  type OwnerKpiSnapshot,
} from "@/lib/domain/owner-kpis";
import { formatMoneyCompact, formatMoney } from "@/lib/domain/billing";
import { agentRegistry } from "@/lib/agents";
import { AnimatedNumber } from "@/components/ui/animated-number";

// ---------------------------------------------------------------------------
// OwnerDashboard — composes the 6 KPI tiles in a 1/2/3-column grid.
//
// The render is purely a function of an OwnerKpiSnapshot. The snapshot
// itself is loaded by the page in a single Promise.all upstream; this
// component does no I/O.
// ---------------------------------------------------------------------------

export interface OwnerDashboardProps {
  snapshot: OwnerKpiSnapshot;
}

export function OwnerDashboard({ snapshot }: OwnerDashboardProps) {
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
  const hasPracticeManagerAgent = "practiceManager" in agentRegistry;
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      <KpiCard {...revenueCard} />
      <KpiCard {...denialsCard} />
      <KpiCard {...scheduleCard} />
      <KpiCard {...agentsCard} />
      <KpiCard {...patientsCard} />
      <KpiCard {...arCard} />
    </div>
  );
}
