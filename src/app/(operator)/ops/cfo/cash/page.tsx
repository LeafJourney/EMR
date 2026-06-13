import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/ornament";
import { fmtMoney } from "@/lib/finance/formatting";
import { CfoTabs } from "../components";
import {
  createBankAccountAction,
  updateBankBalanceAction,
  recordCashEntryAction,
} from "../actions";
import { CashEntriesTable, type CashEntryRow } from "./cash-entries-table";
import type { BankAccountType } from "@prisma/client";

export const metadata = { title: "Cash · CFO" };
export const dynamic = "force-dynamic";

const ACCOUNT_TYPES: { value: BankAccountType; label: string }[] = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "merchant", label: "Merchant" },
  { value: "payroll", label: "Payroll" },
  { value: "reserves", label: "Reserves" },
  { value: "credit_card", label: "Credit card (liability)" },
  { value: "line_of_credit", label: "Line of credit (liability)" },
];

export default async function CashPage() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const [accounts, recentEntries] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    prisma.cashFlowEntry.findMany({
      where: { organizationId: orgId },
      orderBy: { occurredOn: "desc" },
      take: 50,
      include: { bankAccount: { select: { name: true } } },
    }),
  ]);

  const cashTotal = accounts
    .filter((a) => ["checking", "savings", "merchant", "payroll", "reserves"].includes(a.type))
    .reduce((a, b) => a + b.currentBalanceCents, 0);
  const liabilityTotal = accounts
    .filter((a) => ["credit_card", "line_of_credit"].includes(a.type))
    .reduce((a, b) => a + b.currentBalanceCents, 0);

  const entryRows: CashEntryRow[] = recentEntries.map((e) => ({
    id: e.id,
    dateDisplay: e.occurredOn.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    dateMs: e.occurredOn.getTime(),
    description: e.description,
    activity: e.activity,
    accountName: e.bankAccount?.name ?? "—",
    amountDisplay: `${e.direction === "in" ? "+" : "−"}${fmtMoney(e.amountCents)}`,
    amountSignedCents: e.direction === "in" ? e.amountCents : -e.amountCents,
    direction: e.direction as "in" | "out",
  }));

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="CFO · Cash"
        title="Bank accounts & cash position"
        description="Real-time balances across every checking, savings, merchant, and credit account. Manual reconciliation logs a cash flow entry automatically."
      />
      <CfoTabs active="cash" />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-10">
        <Card tone="raised" className="border-l-4 border-l-accent">
          <CardContent className="pt-5 pb-5">
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">Total cash on hand</p>
            <p className="font-display text-2xl text-text tabular-nums mt-1.5">{fmtMoney(cashTotal, { compact: true })}</p>
            <p className="text-[11px] text-text-subtle mt-1">{accounts.filter((a) => !["credit_card", "line_of_credit"].includes(a.type)).length} accounts</p>
          </CardContent>
        </Card>
        <Card tone="raised">
          <CardContent className="pt-5 pb-5">
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">Credit lines outstanding</p>
            <p className="font-display text-2xl text-danger tabular-nums mt-1.5">{fmtMoney(liabilityTotal, { compact: true })}</p>
            <p className="text-[11px] text-text-subtle mt-1">{accounts.filter((a) => ["credit_card", "line_of_credit"].includes(a.type)).length} accounts</p>
          </CardContent>
        </Card>
        <Card tone="raised">
          <CardContent className="pt-5 pb-5">
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">Net cash position</p>
            <p className="font-display text-2xl text-text tabular-nums mt-1.5">{fmtMoney(cashTotal - liabilityTotal, { compact: true })}</p>
            <p className="text-[11px] text-text-subtle mt-1">Cash − credit balances</p>
          </CardContent>
        </Card>
      </div>

      {/* Account list with reconcile */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Accounts</Eyebrow>
        <div className="space-y-2">
          {accounts.length === 0 && (
            <Card>
              <CardContent className="pt-6 pb-6 text-center text-text-subtle italic text-sm">
                No accounts yet — add the first checking account below.
              </CardContent>
            </Card>
          )}
          {accounts.map((a) => {
            const isLiability = ["credit_card", "line_of_credit"].includes(a.type);
            return (
              <Card key={a.id} tone="raised">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text">{a.name}</span>
                        <Badge tone={isLiability ? "danger" : "neutral"} className="text-[10px]">
                          {ACCOUNT_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
                        </Badge>
                        {a.last4 && <span className="text-[11px] text-text-subtle">···{a.last4}</span>}
                      </div>
                      <p className="text-[11px] text-text-subtle mt-0.5">
                        {a.institution ?? "—"} · last reconciled {a.asOfDate.toLocaleString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-display text-xl tabular-nums ${isLiability ? "text-danger" : "text-text"}`}>
                        {fmtMoney(a.currentBalanceCents)}
                      </p>
                    </div>
                    <form action={updateBankBalanceAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={a.id} />
                      <Input name="balance" type="number" step="0.01" placeholder="New balance" className="w-32 h-8 text-xs" />
                      <Button type="submit" size="sm" variant="ghost">Reconcile</Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Add account */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Add account</Eyebrow>
        <Card tone="raised">
          <CardContent className="pt-5 pb-5">
            <form action={createBankAccountAction} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-3">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Name</label>
                <Input name="name" required placeholder="e.g. Operating checking" />
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Type</label>
                <select name="type" required defaultValue="checking" className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm">
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Institution</label>
                <Input name="institution" placeholder="Chase, Mercury…" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Last 4</label>
                <Input name="last4" maxLength={4} placeholder="0000" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Opening balance</label>
                <Input name="opening" type="number" step="0.01" placeholder="0.00" />
              </div>
              <div className="md:col-span-1">
                <Button type="submit" variant="primary" className="w-full">Add</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Manual cash entry */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Log cash movement</Eyebrow>
        <Card tone="raised">
          <CardContent className="pt-5 pb-5">
            <form action={recordCashEntryAction} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Direction</label>
                <select name="direction" required className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm">
                  <option value="in">In</option>
                  <option value="out">Out</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Activity</label>
                <select name="activity" required className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm">
                  <option value="operating">Operating</option>
                  <option value="investing">Investing</option>
                  <option value="financing">Financing</option>
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
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Account</label>
                <select name="bankAccountId" className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm">
                  <option value="">— none —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-1">
                <Button type="submit" variant="primary" className="w-full">Log</Button>
              </div>
              <div className="md:col-span-12">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Description</label>
                <Input name="description" required placeholder="e.g. Q1 estimated tax payment to IRS" />
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Recent cash flow entries — sortable columns + CSV/print export (MASTER prompt G5/G6) */}
      <div>
        <Eyebrow className="mb-4">Recent cash movements</Eyebrow>
        <CashEntriesTable rows={entryRows} />
      </div>
    </PageShell>
  );
}
