import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/ornament";
import { fmtMoney } from "@/lib/finance/formatting";
import { CfoTabs } from "../components";
import { upsertGoalAction } from "../actions";
import { GoalsSection, type GoalView } from "./goals-section";
import type { FinancialGoal, FinancialGoalKind } from "@prisma/client";

export const metadata = { title: "Goals · CFO" };
export const dynamic = "force-dynamic";

const KINDS: { value: FinancialGoalKind; label: string; field: "amount" | "pct" | "days"; placeholder: string }[] = [
  { value: "revenue_target", label: "Revenue target", field: "amount", placeholder: "$ amount" },
  { value: "ebitda_target", label: "EBITDA target", field: "amount", placeholder: "$ amount" },
  { value: "gross_margin_target", label: "Gross margin target", field: "pct", placeholder: "% (e.g. 65)" },
  { value: "cash_runway_min", label: "Minimum runway", field: "days", placeholder: "days (e.g. 180)" },
  { value: "ar_days_max", label: "Max days in A/R", field: "days", placeholder: "days (e.g. 45)" },
  { value: "collection_rate_min", label: "Minimum collection rate", field: "pct", placeholder: "% (e.g. 85)" },
  { value: "custom", label: "Custom", field: "amount", placeholder: "$ amount" },
];

function goalValueLabel(g: FinancialGoal): string {
  return g.targetCents !== null
    ? fmtMoney(g.targetCents)
    : g.targetPct !== null
      ? `${g.targetPct}%`
      : g.targetDays !== null
        ? `${g.targetDays} days`
        : "—";
}

function toGoalView(g: FinancialGoal): GoalView {
  return {
    id: g.id,
    label: g.label,
    kindLabel: g.kind.replace(/_/g, " "),
    period: g.period,
    notes: g.notes,
    valueLabel: goalValueLabel(g),
  };
}

export default async function GoalsPage() {
  const user = await requireUser();
  const orgId = user.organizationId!;
  const [activeGoals, archivedGoals] = await Promise.all([
    prisma.financialGoal.findMany({
      where: { organizationId: orgId, active: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.financialGoal.findMany({
      where: { organizationId: orgId, active: false },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="CFO · Goals"
        title="Financial targets & guardrails"
        description="The numbers the CFO agent benchmarks against. Targets you set here drive anomaly detection and the goal-met badges on KPIs."
      />
      <CfoTabs active="goals" />

      {/* New goal form */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Add goal</Eyebrow>
        <Card tone="raised">
          <CardContent className="pt-5 pb-5">
            <form action={upsertGoalAction} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-3">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Kind</label>
                <select name="kind" required defaultValue="revenue_target" className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm">
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Label</label>
                <Input name="label" required placeholder="e.g. Q2 revenue target" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Period</label>
                <select name="period" defaultValue="monthly" className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm">
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="md:col-span-1">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">$</label>
                <Input name="targetAmount" type="number" step="0.01" min="0" placeholder="—" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">%</label>
                <Input name="targetPct" type="number" step="0.1" min="0" placeholder="—" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Days</label>
                <Input name="targetDays" type="number" min="0" placeholder="—" />
              </div>
              <div className="md:col-span-1">
                <Button type="submit" variant="primary" className="w-full">Add</Button>
              </div>
              <div className="md:col-span-12">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Notes</label>
                <Input name="notes" placeholder="Optional context" />
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Active goals (cap 5 + show more) + archived-goals popup — EMR-1066 */}
      <GoalsSection
        active={activeGoals.map(toGoalView)}
        archived={archivedGoals.map(toGoalView)}
      />
    </PageShell>
  );
}
