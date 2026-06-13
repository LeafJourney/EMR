import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/ornament";
import { fmtMoney } from "@/lib/finance/formatting";
import { LIABILITY_MAP } from "@/lib/finance/chart-of-accounts";
import { CfoTabs } from "../components";
import { createLiabilityAction } from "../actions";
import { LiabilitiesTable, type LiabilityRow } from "./liabilities-table";
import type { LiabilityType } from "@prisma/client";

export const metadata = { title: "Liabilities · CFO" };
export const dynamic = "force-dynamic";

const TYPES: LiabilityType[] = [
  "loan_term",
  "line_of_credit",
  "credit_card",
  "accounts_payable",
  "payroll_payable",
  "tax_payable",
  "deferred_revenue",
  "capital_lease",
  "other",
];

export default async function LiabilitiesPage() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const liabilities = await prisma.liability.findMany({
    where: { organizationId: orgId, OR: [{ closedAt: null }, { closedAt: { gt: new Date() } }] },
    orderBy: [{ type: "asc" }, { startDate: "desc" }],
  });

  const totalPrincipal = liabilities.reduce((a, b) => a + b.principalCents, 0);
  const totalBalance = liabilities.reduce((a, b) => a + b.balanceCents, 0);
  const monthlyDebtService = liabilities.reduce((a, b) => a + (b.monthlyPaymentCents ?? 0), 0);

  const rows: LiabilityRow[] = liabilities.map((l) => ({
    id: l.id,
    name: l.name,
    typeLabel: LIABILITY_MAP[l.type].label,
    balanceDisplay: fmtMoney(l.balanceCents),
    balanceCents: l.balanceCents,
    rateDisplay: l.interestRate ? `${(l.interestRate * 100).toFixed(2)}%` : "—",
    rate: l.interestRate ?? null,
    monthlyDisplay: l.monthlyPaymentCents ? fmtMoney(l.monthlyPaymentCents) : "—",
    monthlyCents: l.monthlyPaymentCents ?? null,
    maturityDisplay: l.maturityDate
      ? l.maturityDate.toLocaleDateString("en-US")
      : "—",
    maturityMs: l.maturityDate ? l.maturityDate.getTime() : null,
  }));

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="CFO · Liabilities"
        title="Loans, lines of credit, and other liabilities"
        description="Term loans, credit lines, accounts payable, and other obligations. Interest accrues automatically into the P&L."
      />
      <CfoTabs active="liabilities" />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <Tile label="Original principal" value={fmtMoney(totalPrincipal, { compact: true })} />
        <Tile label="Outstanding balance" value={fmtMoney(totalBalance, { compact: true })} accent />
        <Tile label="Monthly debt service" value={fmtMoney(monthlyDebtService, { compact: true })} />
        <Tile label="Open obligations" value={String(liabilities.length)} />
      </div>

      {/* Add liability */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Add liability</Eyebrow>
        <Card tone="raised">
          <CardContent className="pt-5 pb-5">
            <form action={createLiabilityAction} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-3">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Name</label>
                <Input name="name" required placeholder="e.g. SBA term loan" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Type</label>
                <select name="type" required defaultValue="loan_term" className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm">
                  {TYPES.map((t) => (
                    <option key={t} value={t}>{LIABILITY_MAP[t].label}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Principal</label>
                <Input name="principal" type="number" step="0.01" min="0" required placeholder="0.00" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Rate</label>
                <Input name="rate" type="number" step="0.001" min="0" placeholder="0.085" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Term (mo)</label>
                <Input name="term" type="number" min="0" placeholder="60" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Monthly pmt</label>
                <Input name="monthly" type="number" step="0.01" min="0" placeholder="0.00" />
              </div>
              <div className="md:col-span-1">
                <Button type="submit" variant="primary" className="w-full">Add</Button>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Start date</label>
                <Input name="startDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Liability list — sortable columns + CSV/print export (MASTER prompt G5/G6) */}
      <Eyebrow className="mb-4">Liabilities</Eyebrow>
      <LiabilitiesTable rows={rows} />
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
