import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/ornament";
import { Badge } from "@/components/ui/badge";
import { rangeForPeriod } from "@/lib/finance/period";
import { buildCashFlow } from "@/lib/finance/cash-flow";
import { fmtMoney } from "@/lib/finance/formatting";
import { CfoTabs, GenerateReportButton, StatementSection } from "../components";

export const metadata = { title: "Cash Flow · CFO" };
export const dynamic = "force-dynamic";

export default async function CashFlowPage({ searchParams }: { searchParams?: { period?: string } }) {
  const user = await requireUser();
  const orgId = user.organizationId!;
  const period = (searchParams?.period as any) || "weekly";

  const range = rangeForPeriod(period, new Date());
  const cf = await buildCashFlow(orgId, range);

  const sections = [cf.sections.operating, cf.sections.investing, cf.sections.financing];

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="CFO · Cash Flow"
        title={`${range.label} cash flow statement`}
        description="Direct-method cash flow — every dollar that actually moved through the practice's bank accounts during this period."
        actions={<GenerateReportButton period={period} />}
      />
      <CfoTabs active="cash-flow" />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-10">
        <Tile label="Opening cash" value={fmtMoney(cf.openingCashCents, { compact: true })} />
        <Tile label="Closing cash" value={fmtMoney(cf.closingCashCents, { compact: true })} accent />
        <Tile label="Net change" value={fmtMoney(cf.netChangeCents, { compact: true })} highlight={cf.netChangeCents >= 0 ? "good" : "bad"} />
        <Tile label="Daily burn" value={fmtMoney(cf.burnRateCentsPerDay)} />
        <Tile label="Runway" value={cf.runwayDays === null ? "😊 + Cash-flow positive" : `😔 − ${cf.runwayDays} days`} highlight={cf.runwayDays === null ? "good" : cf.runwayDays < 90 ? "bad" : undefined} />
      </div>

      {/* Activity sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
        {sections.map((sec) => {
          return (
            <Card key={sec.activity} tone="raised">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display text-base text-text">{sec.label}</h3>
                  <Badge tone={sec.netCents >= 0 ? "success" : "danger"} className="text-[10px] tabular-nums">
                    {fmtMoney(sec.netCents, { sign: true })}
                  </Badge>
                </div>

                <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle mt-2 mb-1">Inflows</p>
                {sec.inflows.length > 0 ? (
                  <div className="divide-y divide-border/60">
                    {sec.inflows.map((line, i) => (
                      <div key={`${line.label}-${i}`} className="flex justify-between py-1.5">
                        <span className="text-sm text-text">{line.label}</span>
                        <span className="text-sm tabular-nums text-success">+{fmtMoney(line.amountCents)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-subtle italic">No inflows.</p>
                )}

                <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle mt-4 mb-1">Outflows</p>
                {sec.outflows.length > 0 ? (
                  <div className="divide-y divide-border/60">
                    {sec.outflows.map((line, i) => (
                      <div key={`${line.label}-${i}`} className="flex justify-between py-1.5">
                        <span className="text-sm text-text">{line.label}</span>
                        <span className="text-sm tabular-nums text-danger">{fmtMoney(line.amountCents)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-subtle italic">No outflows.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Reconciliation */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Reconciliation</Eyebrow>
        <Card tone="raised">
          <CardContent className="pt-5 pb-5">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border/60">
                <tr>
                  <td className="py-2 text-text">Opening cash</td>
                  <td className="py-2 text-right tabular-nums">{fmtMoney(cf.openingCashCents)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-text-muted">Net cash from operations</td>
                  <td className="py-2 text-right tabular-nums">{fmtMoney(cf.netOperatingCents, { sign: true })}</td>
                </tr>
                <tr>
                  <td className="py-2 text-text-muted">Net cash from investing</td>
                  <td className="py-2 text-right tabular-nums">{fmtMoney(cf.netInvestingCents, { sign: true })}</td>
                </tr>
                <tr>
                  <td className="py-2 text-text-muted">Net cash from financing</td>
                  <td className="py-2 text-right tabular-nums">{fmtMoney(cf.netFinancingCents, { sign: true })}</td>
                </tr>
                <tr className="font-medium">
                  <td className="py-2 text-text">Closing cash</td>
                  <td className="py-2 text-right tabular-nums text-text">{fmtMoney(cf.closingCashCents)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
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
