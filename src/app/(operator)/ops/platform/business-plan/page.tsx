import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FUNDING,
  MARKETING_CHANNELS,
  REVENUE_PLAN,
  TARGET_SEGMENTS,
  expectedQuarterlyCloses,
  fundingSanityCheck,
  totalQuarterlySpend,
} from "@/lib/platform/business-plan";
import { FundingTable, type FundingUseRow } from "./funding-table";

export const metadata = { title: "Business plan" };

const TIER_TONE = {
  primary: "accent",
  secondary: "highlight",
  tertiary: "neutral",
} as const;

function fmtUsd(n: number, opts: { short?: boolean } = {}): string {
  if (opts.short) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  }
  return `$${n.toLocaleString()}`;
}

export default async function BusinessPlanPage() {
  await requireUser();
  const sanity = fundingSanityCheck();
  const totalSpend = totalQuarterlySpend();
  const expectedCloses = expectedQuarterlyCloses();

  const fundingRows: FundingUseRow[] = FUNDING.use.map((u, i) => ({
    id: String(i),
    category: u.category,
    allocationDisplay: fmtUsd(u.allocationUsd),
    allocationUsd: u.allocationUsd,
    rationale: u.rationale,
  }));

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Platform · EMR-153"
        title="Marketing + business plan"
        description="Target groups, channel mix, three-year revenue model, and the funding ask. Single source for the deck, the website, and the operator dashboard."
      />

      {/* ─── Target segments ───────────────────────────────── */}
      <section className="mb-10">
        <h2 className="font-display text-xl text-text mb-4">Target segments</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TARGET_SEGMENTS.map((seg) => (
            <Card key={seg.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{seg.name}</CardTitle>
                    <CardDescription>{seg.who}</CardDescription>
                  </div>
                  <Badge tone={TIER_TONE[seg.tier]}>{seg.tier}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-muted italic">"{seg.pain}"</p>
                <p className="text-sm text-text mt-3">{seg.promise}</p>
                <div className="grid grid-cols-2 gap-3 text-[11px] mt-4">
                  <div>
                    <p className="uppercase tracking-[0.14em] text-text-subtle mb-1">TAM</p>
                    <p className="font-mono text-text">{seg.tam.toLocaleString()} clinicians</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.14em] text-text-subtle mb-1">ACV</p>
                    <p className="font-mono text-text">{fmtUsd(seg.acvUsd)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="uppercase tracking-[0.14em] text-text-subtle mb-1">
                      Channels
                    </p>
                    <p className="text-text-muted">{seg.acquisitionChannels.join(" · ")}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="uppercase tracking-[0.14em] text-text-subtle mb-1">
                      Flagship modules
                    </p>
                    <p className="font-mono text-text-muted">{seg.flagshipModules.join(", ")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ─── Channel mix ───────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="font-display text-xl text-text mb-4">Quarterly channel mix</h2>
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-subtle text-[11px] uppercase tracking-wide">
                    <th className="py-2 pr-4">Channel</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4 text-right">Spend</th>
                    <th className="py-2 pr-4 text-right">Demos</th>
                    <th className="py-2 pr-4 text-right">Close %</th>
                    <th className="py-2 pr-4 text-right">Closes</th>
                  </tr>
                </thead>
                <tbody>
                  {MARKETING_CHANNELS.map((c) => (
                    <tr key={c.id} className="border-t border-border/60 align-top">
                      <td className="py-3 pr-4 font-medium">
                        {c.name}
                        <p className="text-[11px] text-text-muted font-normal mt-0.5">
                          {c.description}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone="neutral">{c.category}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono">
                        {fmtUsd(c.quarterlyBudget)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono">{c.expectedDemos}</td>
                      <td className="py-3 pr-4 text-right font-mono">
                        {(c.expectedCloseRate * 100).toFixed(0)}%
                      </td>
                      <td className="py-3 pr-4 text-right font-mono">
                        {(c.expectedDemos * c.expectedCloseRate).toFixed(1)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border-strong/50 font-medium">
                    <td className="py-3 pr-4">Total</td>
                    <td className="py-3 pr-4"></td>
                    <td className="py-3 pr-4 text-right font-mono">{fmtUsd(totalSpend)}</td>
                    <td className="py-3 pr-4 text-right font-mono">
                      {MARKETING_CHANNELS.reduce((acc, c) => acc + c.expectedDemos, 0)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono">—</td>
                    <td className="py-3 pr-4 text-right font-mono">
                      {expectedCloses.toFixed(1)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─── Three-year revenue model ──────────────────────── */}
      <section className="mb-10">
        <h2 className="font-display text-xl text-text mb-4">Three-year revenue model</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {REVENUE_PLAN.map((y) => (
            <Card key={y.year} tone="raised">
              <CardHeader>
                <CardTitle>Year {y.year}</CardTitle>
                <CardDescription>{y.customers.toLocaleString()} customers</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-text-subtle">ARR</dt>
                    <dd className="font-mono">{fmtUsd(y.arr, { short: true })}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-text-subtle">ARPA</dt>
                    <dd className="font-mono">{fmtUsd(y.arpa)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-text-subtle">Net new MRR adds / mo</dt>
                    <dd className="font-mono">{y.netNewMrrAdds}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-text-subtle">Gross margin</dt>
                    <dd className="font-mono">{(y.grossMargin * 100).toFixed(0)}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-text-subtle">Burn</dt>
                    <dd className="font-mono">{fmtUsd(y.burnUsd, { short: true })}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-text-subtle">Cash EOY</dt>
                    <dd className="font-mono">{fmtUsd(y.cashEoy, { short: true })}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ─── Funding ───────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="font-display text-xl text-text mb-4">Funding ask</h2>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{FUNDING.name}</CardTitle>
                <CardDescription>
                  Raise {fmtUsd(FUNDING.raiseUsd, { short: true })} on{" "}
                  {fmtUsd(FUNDING.preMoneyUsd, { short: true })} pre.
                </CardDescription>
              </div>
              <Badge tone={FUNDING.status === "active" ? "highlight" : "neutral"}>
                {FUNDING.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <FundingTable rows={fundingRows} />
            <p
              className={`text-[11px] mt-4 ${
                sanity.matchesRaise ? "text-text-subtle" : "text-danger"
              }`}
            >
              Total allocated: {fmtUsd(sanity.totalAllocation)} —{" "}
              {sanity.matchesRaise ? "matches raise." : "does not match raise."}
            </p>
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
