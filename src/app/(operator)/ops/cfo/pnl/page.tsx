import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/ornament";
import { rangeForPeriod, priorRange } from "@/lib/finance/period";
import { buildPnl } from "@/lib/finance/pnl";
import { fmtMoney, fmtPct, changeBadgeText } from "@/lib/finance/formatting";
import { CfoTabs, GenerateReportButton } from "../components";
import { PnlTable, type PnlRow } from "./pnl-table";
import { PnlKpiGrid, type PnlKpiView, type PnlSectionView } from "./pnl-kpi-grid";

export const metadata = { title: "P&L · CFO" };
export const dynamic = "force-dynamic";

export default async function PnlPage({ searchParams }: { searchParams?: { period?: string } }) {
  const user = await requireUser();
  const orgId = user.organizationId!;
  const period = (searchParams?.period as any) || "weekly";

  const range = rangeForPeriod(period, new Date());
  const prior = priorRange(range);
  const [pnl, priorPnl] = await Promise.all([
    buildPnl(orgId, range),
    buildPnl(orgId, prior),
  ]);

  const lines: Array<{ label: string; current: number; prior: number; sign: 1 | -1 }> = [
    { label: "Revenue", current: pnl.totals.revenueCents, prior: priorPnl.totals.revenueCents, sign: 1 },
    { label: "Cost of goods", current: pnl.totals.cogsCents, prior: priorPnl.totals.cogsCents, sign: -1 },
    { label: "Gross profit", current: pnl.totals.grossProfitCents, prior: priorPnl.totals.grossProfitCents, sign: 1 },
    { label: "Operating expenses", current: pnl.totals.opexCents, prior: priorPnl.totals.opexCents, sign: -1 },
    { label: "Operating income", current: pnl.totals.operatingIncomeCents, prior: priorPnl.totals.operatingIncomeCents, sign: 1 },
    { label: "Depreciation & amortization", current: pnl.totals.daCents, prior: priorPnl.totals.daCents, sign: -1 },
    { label: "Interest & financing", current: pnl.totals.interestCents, prior: priorPnl.totals.interestCents, sign: -1 },
    { label: "Income & excise tax", current: pnl.totals.taxesCents, prior: priorPnl.totals.taxesCents, sign: -1 },
    { label: "Net income", current: pnl.totals.netIncomeCents, prior: priorPnl.totals.netIncomeCents, sign: 1 },
  ];

  const pnlRows: PnlRow[] = lines.map((row) => {
    const delta = row.current - row.prior;
    const pct = row.prior !== 0 ? (delta / Math.abs(row.prior)) * 100 : null;
    const change = changeBadgeText(pct, row.sign === 1);
    return {
      id: row.label,
      line: row.label,
      currentDisplay: fmtMoney(row.current),
      currentCents: row.current,
      priorDisplay: fmtMoney(row.prior),
      priorCents: row.prior,
      deltaDisplay: change.text,
      deltaCents: delta,
      badgeTone: change.tone === "good" ? "success" : change.tone === "bad" ? "danger" : "neutral",
      badgeText: change.text,
      periodLabel: range.period,
      priorPeriodLabel: prior.period,
    };
  });

  // EMR-1031 — the statement detail sections, now surfaced inside each KPI's
  // drill-in popup rather than as standalone cards on the page.
  const sectionRevenue: PnlSectionView = {
    title: "Revenue",
    totalLabel: "Total revenue",
    totalCents: pnl.totals.revenueCents,
    emphasized: true,
    lines: pnl.sections.revenue.lines.map((l) => ({
      label: l.label,
      amountCents: l.amountCents,
      detail: `${l.itemCount} record${l.itemCount !== 1 ? "s" : ""}`,
    })),
  };
  const sectionCogs: PnlSectionView = {
    title: "Cost of goods & services",
    totalLabel: "Total COGS",
    totalCents: pnl.sections.cogs.totalCents,
    lines: pnl.sections.cogs.lines.map((l) => ({
      label: l.label,
      amountCents: l.amountCents,
      detail: `${l.itemCount} expense${l.itemCount !== 1 ? "s" : ""}`,
    })),
  };
  const sectionOpex: PnlSectionView = {
    title: "Operating expenses",
    totalLabel: "Total operating expenses",
    totalCents: pnl.sections.operatingExpenses.totalCents,
    lines: pnl.sections.operatingExpenses.lines.map((l) => ({
      label: l.label,
      amountCents: l.amountCents,
      detail: `${l.itemCount} entr${l.itemCount !== 1 ? "ies" : "y"}`,
    })),
  };
  const sectionDa: PnlSectionView = {
    title: "Depreciation & amortization",
    totalLabel: "Total D&A (non-cash)",
    totalCents: pnl.sections.depreciationAmortization.totalCents,
    lines: pnl.sections.depreciationAmortization.lines.map((l) => ({
      label: l.label,
      amountCents: l.amountCents,
    })),
  };
  const sectionInterest: PnlSectionView = {
    title: "Interest & financing",
    totalLabel: "Total non-operating",
    totalCents: pnl.sections.nonOperating.totalCents,
    lines: pnl.sections.nonOperating.lines.map((l) => ({
      label: l.label,
      amountCents: l.amountCents,
    })),
  };
  const sectionTaxes: PnlSectionView = {
    title: "Income & excise tax",
    totalLabel: "Total tax",
    totalCents: pnl.sections.taxes.totalCents,
    lines: pnl.sections.taxes.lines.map((l) => ({
      label: l.label,
      amountCents: l.amountCents,
    })),
  };

  // Each Headline KPI's popup shows the statement section(s) that drive it.
  const kpis: PnlKpiView[] = [
    {
      id: "revenue",
      label: "Revenue",
      valueDisplay: fmtMoney(pnl.totals.revenueCents, { compact: true }),
      ...kpiChange(pnl.totals.revenueCents, priorPnl.totals.revenueCents),
      sections: [sectionRevenue],
    },
    {
      id: "gross_margin",
      label: "Gross margin",
      valueDisplay: fmtPct(pnl.totals.grossMarginPct),
      ...kpiChange(pnl.totals.grossMarginPct, priorPnl.totals.grossMarginPct),
      sections: [sectionRevenue, sectionCogs],
    },
    {
      id: "ebitda",
      label: "EBITDA",
      valueDisplay: fmtMoney(pnl.totals.ebitdaCents, { compact: true }),
      ...kpiChange(pnl.totals.ebitdaCents, priorPnl.totals.ebitdaCents),
      sections: [sectionOpex],
    },
    {
      id: "net_income",
      label: "Net income",
      valueDisplay: fmtMoney(pnl.totals.netIncomeCents, { compact: true }),
      ...kpiChange(pnl.totals.netIncomeCents, priorPnl.totals.netIncomeCents),
      sections: [sectionDa, sectionInterest, sectionTaxes],
    },
    {
      id: "net_margin",
      label: "Net margin",
      valueDisplay: fmtPct(pnl.totals.netMarginPct),
      ...kpiChange(pnl.totals.netMarginPct, priorPnl.totals.netMarginPct),
      sections: [
        sectionRevenue,
        sectionCogs,
        sectionOpex,
        sectionDa,
        sectionInterest,
        sectionTaxes,
      ],
    },
  ];

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="CFO · Profit & Loss"
        title={`${range.label} P&L`}
        description="Accrual revenue (collected this period) less cost of goods, operating expenses, depreciation, interest, and tax."
        actions={<GenerateReportButton period={period} />}
      />
      <CfoTabs active="pnl" />

      {/* Headline KPIs — click a tile to drill into its statement breakdown.
          The detail sections (Revenue / COGS / OpEx / D&A / Interest / Tax)
          now live inside these popups instead of as standalone cards (EMR-1031). */}
      <PnlKpiGrid kpis={kpis} />

      {/* Side by side: this period vs. prior — sortable columns + CSV/print export (MASTER prompt G5/G6) */}
      <div className="mb-10">
        <Eyebrow className="mb-4">This period vs. prior</Eyebrow>
        <PnlTable rows={pnlRows} periodLabel={range.period} priorPeriodLabel={prior.period} />
      </div>

      {/* Memo lines */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Memo</Eyebrow>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MemoTile label="Charges billed" value={fmtMoney(pnl.memo.chargesBilledCents)} hint="Gross charges (accrual)" />
          <MemoTile label="Charges collected" value={fmtPct(pnl.memo.chargesCollectedRatePct)} hint="Of charges billed" />
          <MemoTile label="Active claims" value={String(pnl.memo.activeClaims)} hint="Open across all stages" />
          <MemoTile label="Active orders" value={String(pnl.memo.activeOrders)} hint="Marketplace orders this period" />
        </div>
      </div>
    </PageShell>
  );
}

function kpiChange(
  current: number,
  prior: number,
): { changeText: string | null; badgeTone: "success" | "danger" | "neutral" } {
  const pct =
    prior !== 0 ? Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10 : null;
  const change = changeBadgeText(pct, true);
  return {
    changeText: pct !== null ? change.text : null,
    badgeTone:
      change.tone === "good"
        ? "success"
        : change.tone === "bad"
          ? "danger"
          : "neutral",
  };
}

function MemoTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">{label}</p>
        <p className="font-display text-xl text-text tabular-nums mt-1">{value}</p>
        <p className="text-[11px] text-text-subtle mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}
