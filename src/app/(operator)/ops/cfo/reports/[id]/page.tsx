import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/ornament";
import { fmtMoney, fmtPct } from "@/lib/finance/formatting";
import { CfoTabs, AnomaliesPanel, StatementSection } from "../../components";
import type { CfoReport } from "@/lib/finance/report";
import type { Anomaly } from "@/lib/finance/anomalies";

export const dynamic = "force-dynamic";

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const briefing = await prisma.financialReport.findUnique({
    where: { id: params.id },
  });
  if (!briefing || briefing.organizationId !== orgId) notFound();
  if (briefing.type !== "cfo_briefing") notFound();

  const report = briefing.data as unknown as CfoReport;
  const anomalies = (briefing.anomalies as unknown as Anomaly[]) ?? [];

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow={`CFO · ${briefing.period} report`}
        title={`${briefing.periodStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} → ${briefing.periodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
        description={`Generated ${briefing.generatedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} by ${briefing.generatedBy}`}
      />
      <CfoTabs active="reports" />

      {/* Narrative */}
      <Card tone="ambient" className="mb-10">
        <CardContent className="pt-6 pb-6">
          {briefing.narrative ? (
            <div className="prose prose-sm max-w-none whitespace-pre-line text-text leading-relaxed">{briefing.narrative}</div>
          ) : (
            <p className="text-text-muted italic">No narrative was attached to this report.</p>
          )}
        </CardContent>
      </Card>

      {/* Headline */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-10">
        <Tile label="Revenue" value={fmtMoney(briefing.revenueCents, { compact: true })} />
        <Tile label="COGS" value={fmtMoney(briefing.cogsCents, { compact: true })} />
        <Tile label="Gross profit" value={fmtMoney(briefing.grossProfitCents, { compact: true })} />
        <Tile label="EBITDA" value={fmtMoney(briefing.ebitdaCents, { compact: true })} accent />
        <Tile label="Net income" value={fmtMoney(briefing.netIncomeCents, { compact: true })} />
        <Tile label="Cash" value={fmtMoney(briefing.cashCents, { compact: true })} />
      </div>

      {/* P&L */}
      <Eyebrow className="mb-3">Profit & loss</Eyebrow>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
        <StatementSection title="Revenue" totalCents={report.pnl.totals.revenueCents} totalLabel="Total revenue" lines={report.pnl.sections.revenue.lines} emphasized />
        <StatementSection title="Cost of goods" totalCents={report.pnl.sections.cogs.totalCents} totalLabel="Total COGS" lines={report.pnl.sections.cogs.lines} />
        <StatementSection title="Operating expenses" totalCents={report.pnl.sections.operatingExpenses.totalCents} totalLabel="Total operating" lines={report.pnl.sections.operatingExpenses.lines} />
        <StatementSection title="D&A + Interest + Taxes" totalCents={report.pnl.sections.depreciationAmortization.totalCents + report.pnl.sections.nonOperating.totalCents + report.pnl.sections.taxes.totalCents} totalLabel="Below-the-line" lines={[
          ...report.pnl.sections.depreciationAmortization.lines,
          ...report.pnl.sections.nonOperating.lines,
          ...report.pnl.sections.taxes.lines,
        ]} />
      </div>

      {/* Cash flow */}
      <Eyebrow className="mb-3">Cash flow</Eyebrow>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
        {(["operating", "investing", "financing"] as const).map((act) => {
          const sec = (report.cashFlow.sections as any)[act];
          return (
            <Card key={act} tone="raised">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display text-base text-text capitalize">{act}</h3>
                  <Badge tone={sec.netCents >= 0 ? "success" : "danger"} className="text-[10px] tabular-nums">{fmtMoney(sec.netCents, { sign: true })}</Badge>
                </div>
                {[...sec.inflows, ...sec.outflows].map((l: any, i: number) => (
                  <div key={i} className="flex justify-between py-1 text-sm border-t border-border/40 first:border-t-0">
                    <span className="text-text-muted truncate">{l.label}</span>
                    <span className={`tabular-nums shrink-0 ${l.amountCents >= 0 ? "text-success" : "text-danger"}`}>{fmtMoney(l.amountCents)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Balance sheet */}
      <Eyebrow className="mb-3">Balance sheet</Eyebrow>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        <StatementSection title="Current assets" totalCents={report.balanceSheet.assets.current.totalCents} totalLabel="Total current assets" lines={report.balanceSheet.assets.current.lines} />
        <StatementSection title="Long-term assets" totalCents={report.balanceSheet.assets.longTerm.totalCents} totalLabel="Total long-term assets" lines={report.balanceSheet.assets.longTerm.lines} />
        <StatementSection title="Current liabilities" totalCents={report.balanceSheet.liabilities.current.totalCents} totalLabel="Total current liabilities" lines={report.balanceSheet.liabilities.current.lines} />
        <StatementSection title="Long-term liabilities" totalCents={report.balanceSheet.liabilities.longTerm.totalCents} totalLabel="Total long-term liabilities" lines={report.balanceSheet.liabilities.longTerm.lines} />
        <StatementSection title="Equity" totalCents={report.balanceSheet.equity.totalCents} totalLabel="Total equity" lines={report.balanceSheet.equity.lines} />
      </div>

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <>
          <Eyebrow className="mb-3">Anomalies Flagged</Eyebrow>
          <AnomaliesPanel anomalies={anomalies} />
        </>
      )}
    </PageShell>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card tone="raised" className={accent ? "border-l-4 border-l-accent" : ""}>
      <CardContent className="pt-4 pb-4">
        <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">{label}</p>
        <p className="font-display text-xl text-text tabular-nums mt-1.5">{value}</p>
      </CardContent>
    </Card>
  );
}
