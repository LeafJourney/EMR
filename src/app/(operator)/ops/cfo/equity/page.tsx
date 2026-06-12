import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/ornament";
import { fmtMoney } from "@/lib/finance/formatting";
import { CfoTabs } from "../components";
import { recordEquityEntryAction } from "../actions";
import { EquityTable, type EquityRow } from "./equity-table";
import type { EquityEntryType } from "@prisma/client";

export const metadata = { title: "Equity · CFO" };
export const dynamic = "force-dynamic";

const TYPES: { value: EquityEntryType; label: string; isInflow: boolean }[] = [
  { value: "capital_contribution", label: "Capital contribution (cash in)", isInflow: true },
  { value: "stock_issuance", label: "Stock issuance (cash in)", isInflow: true },
  { value: "distribution", label: "Owner distribution (cash out)", isInflow: false },
  { value: "stock_buyback", label: "Stock buyback (cash out)", isInflow: false },
  { value: "retained_earnings_adjustment", label: "Retained earnings adjustment", isInflow: false },
  { value: "prior_period_adjustment", label: "Prior period adjustment", isInflow: false },
];

export default async function EquityPage() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const [entries, accounts] = await Promise.all([
    prisma.equityEntry.findMany({
      where: { organizationId: orgId },
      orderBy: { occurredOn: "desc" },
      take: 100,
    }),
    prisma.bankAccount.findMany({ where: { organizationId: orgId, isActive: true } }),
  ]);

  const totalContributed = entries
    .filter((e) => e.type === "capital_contribution" || e.type === "stock_issuance")
    .reduce((a, b) => a + Math.abs(b.amountCents), 0);
  const totalDistributed = entries
    .filter((e) => e.type === "distribution" || e.type === "stock_buyback")
    .reduce((a, b) => a + Math.abs(b.amountCents), 0);

  const rows: EquityRow[] = entries.map((e) => {
    const isInflow = e.amountCents >= 0;
    return {
      id: e.id,
      dateDisplay: e.occurredOn.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      dateMs: e.occurredOn.getTime(),
      typeLabel: e.type.replace(/_/g, " "),
      isInflow,
      description: e.description,
      ownerName: e.ownerName ?? "—",
      amountDisplay: `${isInflow ? "+" : "−"}${fmtMoney(Math.abs(e.amountCents))}`,
      amountCents: e.amountCents,
    };
  });

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="CFO · Equity"
        title="Owner equity & contributions"
        description="Capital contributions, distributions, and equity adjustments. Each entry tied to a bank account also logs the matching cash movement."
      />
      <CfoTabs active="equity" />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-10">
        <Tile label="Total contributed" value={fmtMoney(totalContributed, { compact: true })} accent />
        <Tile label="Total distributed" value={fmtMoney(totalDistributed, { compact: true })} />
        <Tile label="Net contributed capital" value={fmtMoney(totalContributed - totalDistributed, { compact: true })} accent />
      </div>

      {/* New equity entry */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Record equity entry</Eyebrow>
        <Card tone="raised">
          <CardContent className="pt-5 pb-5">
            <form action={recordEquityEntryAction} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Type</label>
                <select name="type" required defaultValue="capital_contribution" className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm">
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Amount</label>
                <Input name="amount" type="number" step="0.01" min="0" required placeholder="0.00" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Date</label>
                <Input name="occurredOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Owner</label>
                <Input name="ownerName" placeholder="Optional" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Bank acct</label>
                <select name="bankAccountId" className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm">
                  <option value="">— none —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-11">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Description</label>
                <Input name="description" required placeholder="e.g. Initial founder capital injection" />
              </div>
              <div className="md:col-span-1">
                <Button type="submit" variant="primary" className="w-full">Record</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Entries — sortable columns + CSV/print export (MASTER prompt G5/G6) */}
      <Eyebrow className="mb-4">Equity entries</Eyebrow>
      <EquityTable rows={rows} />
    </PageShell>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card tone="raised" className={accent ? "border-l-4 border-l-accent" : ""}>
      <CardContent className="pt-5 pb-5">
        <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">{label}</p>
        <p className="font-display text-2xl text-text tabular-nums mt-1.5">{value}</p>
      </CardContent>
    </Card>
  );
}
