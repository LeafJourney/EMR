// Billing tab — Claim + Charge rollups. Renders MTD KPIs and a small
// inline table for the last 12 months. No charting library by design;
// the table is sufficient for the v1 acceptance gate (EMR-745 notes).

import { loadPracticeBilling } from "../loaders";

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-text-muted">
        {label}
      </div>
      <div className="font-display text-xl text-text tracking-tight mt-1">
        {value}
      </div>
      {sub && <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export async function BillingTab({
  organizationId,
}: {
  organizationId: string;
}) {
  const { mtd, last12Months } = await loadPracticeBilling(organizationId);

  const total12 = last12Months.reduce(
    (acc, m) => ({
      claimCount: acc.claimCount + m.claimCount,
      billedCents: acc.billedCents + m.billedCents,
      paidCents: acc.paidCents + m.paidCents,
      gatewayChargeCents: acc.gatewayChargeCents + m.gatewayChargeCents,
    }),
    { claimCount: 0, billedCents: 0, paidCents: 0, gatewayChargeCents: 0 },
  );

  return (
    <div className="grid gap-8">
      <section>
        <h2 className="font-display text-base text-text tracking-tight mb-3">
          Month-to-date
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Claims"
            value={formatNumber(mtd.claimCount)}
            sub="Created this month"
          />
          <Kpi label="Billed" value={formatDollars(mtd.billedCents)} />
          <Kpi
            label="Collected"
            value={formatDollars(mtd.paidCents)}
            sub="Posted to claims"
          />
          <Kpi
            label="Gateway GM"
            value={formatDollars(mtd.gatewayChargeCents)}
            sub="Charges this month"
          />
        </div>
      </section>

      <section>
        <h2 className="font-display text-base text-text tracking-tight mb-3">
          Last 12 months
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border/70 bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                <th className="text-left font-medium px-4 py-2.5">Month</th>
                <th className="text-right font-medium px-4 py-2.5">Claims</th>
                <th className="text-right font-medium px-4 py-2.5">Billed</th>
                <th className="text-right font-medium px-4 py-2.5">Collected</th>
                <th className="text-right font-medium px-4 py-2.5">Gateway GM</th>
              </tr>
            </thead>
            <tbody>
              {last12Months.map((row, idx) => (
                <tr
                  key={row.monthIso}
                  className={
                    idx === last12Months.length - 1
                      ? "border-t border-border/60"
                      : "border-t border-border/40"
                  }
                >
                  <td className="px-4 py-2.5 text-text">{row.monthLabel}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text">
                    {formatNumber(row.claimCount)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text">
                    {formatDollars(row.billedCents)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text">
                    {formatDollars(row.paidCents)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text">
                    {formatDollars(row.gatewayChargeCents)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-surface-muted/30">
                <td className="px-4 py-2.5 text-[11px] uppercase tracking-wider text-text-muted font-medium">
                  Trailing 12 mo
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text font-medium">
                  {formatNumber(total12.claimCount)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text font-medium">
                  {formatDollars(total12.billedCents)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text font-medium">
                  {formatDollars(total12.paidCents)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text font-medium">
                  {formatDollars(total12.gatewayChargeCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
