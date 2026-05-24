import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/ornament";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { fmtMoney } from "@/lib/finance/formatting";
import { classifyExpense } from "@/lib/finance/chart-of-accounts";
import { CfoTabs } from "../components";
import { createExpenseAction, deleteExpenseAction } from "../actions";
import type { ExpenseCategory } from "@prisma/client";

export const metadata = { title: "Expenses · CFO" };
export const dynamic = "force-dynamic";

const CATEGORIES: ExpenseCategory[] = [
  "cogs_inventory",
  "cogs_lab",
  "payroll_clinical",
  "payroll_admin",
  "payroll_taxes",
  "benefits",
  "rent",
  "utilities",
  "software",
  "insurance",
  "marketing",
  "legal_professional",
  "office_supplies",
  "equipment",
  "travel",
  "meals_entertainment",
  "banking_fees",
  "taxes_state_local",
  "taxes_federal",
  "depreciation",
  "amortization",
  "bad_debt",
  "refunds_chargebacks",
  "contractor",
  "research_development",
  "training_education",
  "charitable",
  "other",
];

function categoryLabel(cat: ExpenseCategory): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function ExpensesPage() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const [expenses, bankAccounts, byCategory] = await Promise.all([
    prisma.expense.findMany({
      where: { organizationId: orgId },
      orderBy: { occurredOn: "desc" },
      take: 100,
      include: { bankAccount: { select: { name: true } } },
    }),
    prisma.bankAccount.findMany({ where: { organizationId: orgId, isActive: true } }),
    prisma.expense.groupBy({
      by: ["category"],
      where: {
        organizationId: orgId,
        occurredOn: { gte: new Date(Date.now() - 90 * 86_400_000) },
      },
      _sum: { totalCents: true },
      _count: true,
    }),
  ]);

  const totalThisQuarter = byCategory.reduce((a, c) => a + (c._sum.totalCents ?? 0), 0);

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="CFO · Expenses"
        title="Expense ledger"
        description="Every dollar going out the door — accrued by date incurred, marked paid when cash leaves. Categorized for the P&L roll-up."
      />
      <CfoTabs active="expenses" />

      {/* By-category roll-up */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Last 90 days by category</Eyebrow>
        <Card tone="raised">
          <CardContent className="pt-5 pb-5">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {byCategory
                .sort((a, b) => (b._sum.totalCents ?? 0) - (a._sum.totalCents ?? 0))
                .slice(0, 12)
                .map((row) => {
                  const cls = classifyExpense(row.category);
                  const amount = row._sum.totalCents ?? 0;
                  const pct = totalThisQuarter > 0 ? Math.round((amount / totalThisQuarter) * 100) : 0;
                  return (
                    <div key={row.category} className="rounded-lg border border-border/60 bg-surface px-3 py-2.5">
                      <p className="text-[11px] text-text-subtle leading-tight">{cls.label}</p>
                      <p className="font-display text-base text-text tabular-nums mt-1">{fmtMoney(amount, { compact: true })}</p>
                      <p className="text-[10px] text-text-subtle mt-0.5">{pct}% · {row._count} entries</p>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* New expense form */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Log new expense</Eyebrow>
        <Card tone="raised">
          <CardContent className="pt-5 pb-5">
            <form action={createExpenseAction} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-3">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Vendor</label>
                <Input name="vendor" required placeholder="e.g. ABC Cannabis Lab" />
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Category</label>
                <select name="category" required defaultValue="other" className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{categoryLabel(c)}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Amount</label>
                <Input name="amount" type="number" step="0.01" min="0" required placeholder="0.00" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Tax</label>
                <Input name="tax" type="number" step="0.01" min="0" placeholder="0.00" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Date incurred</label>
                <DatePicker name="occurredOn" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
              <div className="md:col-span-4">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Description</label>
                <Input name="description" required placeholder="What was it for?" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Payment method</label>
                <select name="paymentMethod" className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm">
                  <option value="">— unpaid —</option>
                  <option value="ach">ACH</option>
                  <option value="card">Card</option>
                  <option value="check">Check</option>
                  <option value="wire">Wire</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Bank account</label>
                <select name="bankAccountId" className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm">
                  <option value="">— none —</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Date paid</label>
                <DatePicker name="paidAt" />
              </div>
              <div className="md:col-span-1">
                <Button type="submit" variant="primary" className="w-full">Log</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Expense list */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Recent expenses</Eyebrow>
        <Card tone="raised">
          <CardContent className="pt-3 pb-3 px-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.12em] text-text-subtle border-b border-border/60">
                  <th className="text-left py-2 px-4 font-medium">Date</th>
                  <th className="text-left py-2 px-4 font-medium">Vendor</th>
                  <th className="text-left py-2 px-4 font-medium">Description</th>
                  <th className="text-left py-2 px-4 font-medium">Category</th>
                  <th className="text-left py-2 px-4 font-medium">Status</th>
                  <th className="text-right py-2 px-4 font-medium">Amount</th>
                  <th className="text-right py-2 px-4 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-text-subtle italic">
                      No expenses logged yet.
                    </td>
                  </tr>
                )}
                {expenses.map((e) => {
                  const cls = classifyExpense(e.category);
                  return (
                    <tr key={e.id} className="hover:bg-surface-muted/50">
                      <td className="py-2 px-4 text-text-muted tabular-nums whitespace-nowrap">
                        {e.occurredOn.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td className="py-2 px-4 text-text">{e.vendor}</td>
                      <td className="py-2 px-4 text-text-muted truncate max-w-xs">{e.description}</td>
                      <td className="py-2 px-4">
                        <Badge tone="neutral" className="text-[10px]">{cls.label}</Badge>
                      </td>
                      <td className="py-2 px-4">
                        {e.paidAt ? (
                          <Badge tone="success" className="text-[10px]">Paid</Badge>
                        ) : (
                          <Badge tone="warning" className="text-[10px]">Accrued</Badge>
                        )}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-text">{fmtMoney(e.totalCents)}</td>
                      <td className="py-2 px-4 text-right">
                        <form action={deleteExpenseAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <button type="submit" className="text-[11px] text-danger hover:underline">Delete</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
