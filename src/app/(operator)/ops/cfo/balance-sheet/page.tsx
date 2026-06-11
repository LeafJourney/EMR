import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/ornament";
import { buildBalanceSheet } from "@/lib/finance/balance-sheet";
import { fmtMoney } from "@/lib/finance/formatting";
import { CfoTabs, GenerateReportButton, StatementSection } from "../components";

export const metadata = { title: "Balance Sheet · CFO" };
export const dynamic = "force-dynamic";

export default async function BalanceSheetPage() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const asOf = new Date();
  const bs = await buildBalanceSheet(orgId, asOf);

  const balanced = Math.abs(bs.assets.totalCents - bs.totalLiabilitiesAndEquityCents) <= 1;

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="CFO · Balance Sheet"
        title={`Balance sheet as of ${asOf.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}
        description="Point-in-time snapshot of what the practice owns, owes, and is worth — assets, liabilities, and equity, balanced."
        actions={<GenerateReportButton period="weekly" />}
      />
      <CfoTabs active="balance-sheet" />

      {/* Headline */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <Tile label="Total assets" value={fmtMoney(bs.assets.totalCents, { compact: true })} accent />
        <Tile label="Total liabilities" value={fmtMoney(bs.liabilities.totalCents, { compact: true })} highlight="bad" />
        <Tile label="Total equity" value={fmtMoney(bs.equity.totalCents, { compact: true })} accent />
        <Tile label="Working capital" value={fmtMoney(bs.ratios.workingCapitalCents, { compact: true })} highlight={bs.ratios.workingCapitalCents < 0 ? "bad" : "good"} />
      </div>

      {/* Ratios */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <Ratio label="Current ratio" value={bs.ratios.currentRatio.toFixed(2)} target="≥ 2.0" met={bs.ratios.currentRatio >= 2} definition="Current assets ÷ current liabilities — ability to cover short-term obligations." />
        <Ratio label="Quick ratio" value={bs.ratios.quickRatio.toFixed(2)} target="≥ 1.0" met={bs.ratios.quickRatio >= 1} definition="Liquid assets ÷ current liabilities, excluding inventory." />
        <Ratio label="Debt / equity" value={bs.ratios.debtToEquity.toFixed(2)} target="≤ 2.0" met={bs.ratios.debtToEquity <= 2} />
        <Ratio
          label="Books balance"
          value={balanced ? "✓ Balanced" : `Δ ${fmtMoney(bs.assets.totalCents - bs.totalLiabilitiesAndEquityCents)}`}
          target=""
          met={balanced}
        />
      </div>

      {/* Two-column statement layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ASSETS */}
        <div>
          <Eyebrow className="mb-3">Assets</Eyebrow>
          <div className="space-y-4">
            <StatementSection
              title="Current assets"
              totalCents={bs.assets.current.totalCents}
              totalLabel="Total current assets"
              lines={bs.assets.current.lines}
            />
            <StatementSection
              title="Long-term assets"
              totalCents={bs.assets.longTerm.totalCents}
              totalLabel="Total long-term assets"
              lines={bs.assets.longTerm.lines}
            />
            <Card tone="raised" className="border-l-4 border-l-accent">
              <CardContent className="pt-4 pb-4 flex justify-between items-center">
                <span className="font-display text-base text-text">Total assets</span>
                <span className="font-display text-lg text-text tabular-nums">{fmtMoney(bs.assets.totalCents)}</span>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* LIABILITIES + EQUITY */}
        <div>
          <Eyebrow className="mb-3">Liabilities & Equity</Eyebrow>
          <div className="space-y-4">
            <StatementSection
              title="Current liabilities"
              totalCents={bs.liabilities.current.totalCents}
              totalLabel="Total current liabilities"
              lines={bs.liabilities.current.lines}
            />
            <StatementSection
              title="Long-term liabilities"
              totalCents={bs.liabilities.longTerm.totalCents}
              totalLabel="Total long-term liabilities"
              lines={bs.liabilities.longTerm.lines}
            />
            <StatementSection
              title="Equity"
              totalCents={bs.equity.totalCents}
              totalLabel="Total equity"
              lines={bs.equity.lines}
            />
            <Card tone="raised" className="border-l-4 border-l-accent">
              <CardContent className="pt-4 pb-4 flex justify-between items-center">
                <span className="font-display text-base text-text">Total liabilities & equity</span>
                <span className="font-display text-lg text-text tabular-nums">{fmtMoney(bs.totalLiabilitiesAndEquityCents)}</span>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function Tile({ label, value, accent, highlight }: { label: string; value: string; accent?: boolean; highlight?: "good" | "bad" }) {
  return (
    <Card tone="raised" className={accent ? "border-l-4 border-l-accent" : highlight === "bad" ? "border-l-4 border-l-danger" : highlight === "good" ? "border-l-4 border-l-[color:var(--success)]" : ""}>
      <CardContent className="pt-5 pb-5">
        <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">{label}</p>
        <p className="font-display text-2xl text-text tabular-nums mt-1.5">{value}</p>
      </CardContent>
    </Card>
  );
}

function Ratio({ label, value, target, met, definition }: { label: string; value: string; target: string; met: boolean | null; definition?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">{label}</p>
        <p className={`font-display text-xl tabular-nums mt-1 ${met === true ? "text-success" : met === false ? "text-danger" : "text-text"}`}>{value}</p>
        {target && <p className="text-[11px] text-text-subtle mt-1">Target: {target}</p>}
        {definition && <p className="text-[11px] text-text-subtle mt-1 leading-tight">{definition}</p>}
      </CardContent>
    </Card>
  );
}
