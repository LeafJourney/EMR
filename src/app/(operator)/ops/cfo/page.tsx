import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import { rangeForPeriod } from "@/lib/finance/period";
import { buildCfoReport, getLatestCfoBriefing } from "@/lib/finance/report";
import { fmtMoney, fmtPct, changeBadgeText } from "@/lib/finance/formatting";
import { CfoTabs, AnomaliesPanel, GenerateReportButton } from "./components";
import { TrendLine } from "@/components/charts";
import { MetricBoxGroup } from "@/components/ops/master";
import { CfoKpiGrid, type CfoKpiView } from "./cfo-kpi-grid";
import type { KpiCard } from "@/lib/finance/kpis";

export const metadata = { title: "CFO" };
export const dynamic = "force-dynamic";

export default async function CfoOverviewPage({
  searchParams,
}: {
  searchParams?: { period?: string };
}) {
  const user = await requireUser();
  const orgId = user.organizationId!;
  const period = (searchParams?.period as any) || "weekly";

  const range = rangeForPeriod(period, new Date());
  const [report, latestBriefing] = await Promise.all([
    buildCfoReport(orgId, range),
    getLatestCfoBriefing(orgId),
  ]);

  const generatedRecently =
    latestBriefing &&
    latestBriefing.periodStart.getTime() === range.start.getTime() &&
    latestBriefing.periodEnd.getTime() === range.end.getTime();

  // Branded TrendLine: revenue vs EBITDA over the same weekly window. Cents → dollars
  // so the y-axis ticks read as small integers, and so the tooltip stays compact.
  const weeklyTrendData = report.weeklySeries.map((p) => ({
    label: p.label,
    revenue: Math.round(p.revenueCents / 100),
    ebitda: Math.round(p.ebitdaCents / 100),
  }));
  // History series (whole dollars) powering the MetricBox drill-in popups —
  // real per-week / per-month figures, never fabricated.
  const weeklyRevenueHistory = weeklyTrendData.map((p) => ({ label: p.label, value: p.revenue }));
  const weeklyEbitdaHistory = weeklyTrendData.map((p) => ({ label: p.label, value: p.ebitda }));
  const monthlyNetHistory = report.monthlySeries.map((p) => ({
    label: p.label.slice(0, 3),
    value: Math.round(p.netIncomeCents / 100),
  }));

  // EMR-1064 — headline-KPI drill-in views. The 4 P&L KPIs get their real
  // weekly series (Gross margin derived from revenue/COGS); the balance/cash
  // snapshots have no per-period series, so their popups show a current value
  // with an honest "history accrues over time" note (never a fabricated chart).
  const ws = report.weeklySeries;
  const cfoKpiViews: CfoKpiView[] = report.kpis.map((kpi): CfoKpiView => {
    const change = changeBadgeText(kpi.changePct ?? null);
    const hasChange = kpi.changePct !== undefined && kpi.changePct !== null;
    const hasGoal = kpi.goalValue !== undefined && kpi.goalValue !== null;
    let history: { label: string; value: number }[] = [];
    let valueFormat: CfoKpiView["valueFormat"] =
      kpi.unit === "cents" ? "money" : kpi.unit === "pct" ? "percent" : "number";
    let compareEligible = false;
    if (kpi.id === "revenue") {
      history = ws.map((p) => ({ label: p.label, value: Math.round(p.revenueCents / 100) }));
      valueFormat = "money";
      compareEligible = true;
    } else if (kpi.id === "ebitda") {
      history = ws.map((p) => ({ label: p.label, value: Math.round(p.ebitdaCents / 100) }));
      valueFormat = "money";
      compareEligible = true;
    } else if (kpi.id === "net_income") {
      history = ws.map((p) => ({ label: p.label, value: Math.round(p.netIncomeCents / 100) }));
      valueFormat = "money";
      compareEligible = true;
    } else if (kpi.id === "gross_margin") {
      history = ws.map((p) => ({
        label: p.label,
        value:
          p.revenueCents > 0
            ? Math.round(((p.revenueCents - p.cogsCents) / p.revenueCents) * 1000) / 10
            : 0,
      }));
      valueFormat = "percent";
    }
    return {
      id: kpi.id,
      label: kpi.label,
      valueDisplay: cfoKpiValueDisplay(kpi),
      changeText: hasChange ? change.text : null,
      badgeTone:
        change.tone === "good" ? "success" : change.tone === "bad" ? "danger" : "neutral",
      goalLabel: hasGoal ? (kpi.goalMet ? "on goal" : "off goal") : null,
      goalMet: !!kpi.goalMet,
      description: kpi.description,
      history,
      valueFormat,
      compareEligible,
    };
  });

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="CFO"
        title="Office of the CFO"
        description={`${range.label} · real-time P&L, cash flow, and balance sheet generated from every dollar moving through Leafjourney.`}
        actions={
          <div className="flex items-center gap-2">
            <PeriodSwitcher current={period} />
            <GenerateReportButton period={period} />
          </div>
        }
      />
      <CfoTabs active="overview" />

      {/* CFO narrative */}
      <div className="mb-10">
        <Eyebrow className="mb-4">CFO briefing</Eyebrow>
        <Card tone="ambient">
          <CardContent className="pt-6 pb-6">
            {generatedRecently && latestBriefing?.narrative ? (
              <div className="prose prose-sm max-w-none whitespace-pre-line text-text leading-relaxed">
                {latestBriefing.narrative}
              </div>
            ) : (
              <div className="text-sm text-text-muted leading-relaxed">
                <p className="mb-3">
                  No briefing has been published for {range.label} yet. The CFO agent
                  will compile a written analysis the moment you click <em>Generate</em>.
                </p>
                <p className="text-text-subtle italic">
                  In the meantime, the live KPIs below reflect the books as they
                  stand right now — no manual report needed.
                </p>
              </div>
            )}
            {generatedRecently && latestBriefing && (
              <p className="text-[11px] text-text-subtle mt-4">
                Briefing generated{" "}
                {latestBriefing.generatedAt.toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* KPI grid — each compact tile drills into a popup (history chart +
          Google-Finance hover + feather cycle); the $-tiles can be
          compare-selected to overlay on one chart (EMR-1064). */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Headline KPIs (Key Performance Indicators)</Eyebrow>
        <CfoKpiGrid kpis={cfoKpiViews} />
      </div>

      {/* Anomalies */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Anomalies & flags</Eyebrow>
        <AnomaliesPanel anomalies={report.anomalies} />
      </div>

      <EditorialRule className="my-10" />

      {/* Trend visuals — each tile drills into a popup with the full history,
          Google-Finance-style hover tooltips, and a "feather" button that
          cycles line / area / bar (G10 + G11). Tick the compare boxes on ≥2
          same-period tiles to overlay them on one chart (G9). */}
      <MetricBoxGroup
        className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10"
        compareTitle="Compare financial trends"
        valueFormat="money"
        metrics={[
          {
            id: "weekly-revenue",
            eyebrow: "Weekly revenue · last 13 weeks",
            headline: fmtMoney(report.pnl.totals.revenueCents, { compact: true }),
            history: weeklyRevenueHistory,
            valueFormat: "money",
            goodWhen: "up",
            initialChartType: "line",
            popupTitle: "Weekly revenue",
            popupDescription: "Revenue posted per week over the last 13 weeks.",
            detailHref: "/ops/cfo/pnl",
            detailLabel: "Open P&L",
          },
          {
            id: "weekly-ebitda",
            eyebrow: "Weekly EBITDA · last 13 weeks",
            headline: fmtMoney(report.pnl.totals.ebitdaCents, { compact: true }),
            history: weeklyEbitdaHistory,
            valueFormat: "money",
            goodWhen: "up",
            initialChartType: "area",
            popupTitle: "Weekly EBITDA",
            popupDescription:
              "Earnings before interest, taxes, depreciation & amortization, per week.",
            detailHref: "/ops/cfo/pnl",
            detailLabel: "Open P&L",
          },
          {
            id: "monthly-net",
            eyebrow: "Monthly net income · last 12 months",
            headline: fmtMoney(report.pnl.totals.netIncomeCents, { compact: true }),
            history: monthlyNetHistory,
            valueFormat: "money",
            goodWhen: "up",
            initialChartType: "bar",
            popupTitle: "Monthly net income",
            popupDescription: "Net income per month over the last 12 months.",
            detailHref: "/ops/cfo/pnl",
            detailLabel: "Open P&L",
          },
        ]}
      />

      {/* Deep-look: revenue vs EBITDA — branded TrendLine wrapper */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Revenue vs EBITDA · last 13 weeks</Eyebrow>
        <Card tone="raised">
          <CardContent className="pt-5 pb-5">
            <TrendLine
              data={weeklyTrendData}
              xKey="label"
              height={280}
              lines={[
                { dataKey: "revenue", label: "Revenue ($)" },
                { dataKey: "ebitda", label: "EBITDA ($)" },
              ]}
              emptyTitle="No financial activity yet"
              emptyDescription="Once revenue and expenses post, this chart fills in week by week."
            />
          </CardContent>
        </Card>
      </div>

      {/* Quick statement summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
        <SummaryCard
          eyebrow="Profit & loss"
          headline={fmtMoney(report.pnl.totals.netIncomeCents, { compact: true })}
          rows={[
            ["Revenue", fmtMoney(report.pnl.totals.revenueCents)],
            ["COGS", fmtMoney(report.pnl.totals.cogsCents)],
            ["Gross profit", `${fmtMoney(report.pnl.totals.grossProfitCents)} (${fmtPct(report.pnl.totals.grossMarginPct)})`],
            ["Operating expenses", fmtMoney(report.pnl.totals.opexCents)],
            ["EBITDA", fmtMoney(report.pnl.totals.ebitdaCents)],
          ]}
          href="/ops/cfo/pnl"
        />
        <SummaryCard
          eyebrow="Cash flow"
          headline={fmtMoney(report.cashFlow.closingCashCents, { compact: true })}
          rows={[
            ["Operating", fmtMoney(report.cashFlow.netOperatingCents)],
            ["Investing", fmtMoney(report.cashFlow.netInvestingCents)],
            ["Financing", fmtMoney(report.cashFlow.netFinancingCents)],
            ["Net change", fmtMoney(report.cashFlow.netChangeCents)],
            ["Runway", report.cashFlow.runwayDays === null ? "∞ (cash-flow positive)" : `${report.cashFlow.runwayDays} days`],
          ]}
          href="/ops/cfo/cash-flow"
        />
        <SummaryCard
          eyebrow="Balance sheet"
          headline={fmtMoney(report.balanceSheet.assets.totalCents, { compact: true })}
          rows={[
            ["Total assets", fmtMoney(report.balanceSheet.assets.totalCents)],
            ["Total liabilities", fmtMoney(report.balanceSheet.liabilities.totalCents)],
            ["Total equity", fmtMoney(report.balanceSheet.equity.totalCents)],
            ["Working capital", fmtMoney(report.balanceSheet.ratios.workingCapitalCents)],
            ["Current ratio", report.balanceSheet.ratios.currentRatio.toFixed(2)],
          ]}
          href="/ops/cfo/balance-sheet"
        />
      </div>
    </PageShell>
  );
}

function cfoKpiValueDisplay(kpi: KpiCard): string {
  return kpi.unit === "cents"
    ? fmtMoney(kpi.valueCents ?? 0, { compact: true })
    : kpi.unit === "pct"
      ? fmtPct(kpi.valueNumber ?? 0)
      : kpi.unit === "days"
        ? `${kpi.valueNumber ?? 0}d`
        : kpi.unit === "ratio"
          ? (kpi.valueNumber ?? 0).toFixed(2)
          : `${kpi.valueNumber ?? 0}`;
}

function SummaryCard({
  eyebrow,
  headline,
  rows,
  href,
}: {
  eyebrow: string;
  headline: string;
  rows: Array<[string, string]>;
  href: string;
}) {
  return (
    <a
      href={href}
      className="block rounded-xl border border-border bg-surface-raised shadow-md hover:shadow-lg transition-shadow"
    >
      <div className="px-6 pt-5 pb-5">
        <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">{eyebrow}</p>
        <p className="font-display text-3xl text-text tabular-nums mt-1.5 mb-4">{headline}</p>
        <div className="space-y-1.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between text-[13px]">
              <span className="text-text-muted">{k}</span>
              <span className="text-text tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </a>
  );
}

function PeriodSwitcher({ current }: { current: string }) {
  const periods: Array<{ id: string; label: string }> = [
    { id: "weekly", label: "Week" },
    { id: "monthly", label: "Month" },
    { id: "quarterly", label: "Quarter" },
    { id: "annual", label: "Year" },
  ];
  return (
    <div className="flex items-center gap-0.5 bg-surface-muted rounded-md p-0.5 border border-border/60">
      {periods.map((p) => (
        <a
          key={p.id}
          href={`/ops/cfo?period=${p.id}`}
          className={
            "px-2.5 py-1 text-xs rounded transition-colors " +
            (p.id === current
              ? "bg-surface text-text shadow-sm"
              : "text-text-muted hover:text-text")
          }
        >
          {p.label}
        </a>
      ))}
    </div>
  );
}
