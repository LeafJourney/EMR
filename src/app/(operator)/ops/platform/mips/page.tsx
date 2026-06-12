import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { extrapolate, demoCohort, type MipsCategory } from "@/lib/platform/mips";
import { MipsTable, type MipsMeasureRow } from "./mips-table";

export const metadata = { title: "MIPS console" };

const CATEGORY_LABELS: Record<MipsCategory, string> = {
  quality: "Quality",
  promoting_interoperability: "Promoting Interoperability",
  improvement_activities: "Improvement Activities",
  cost: "Cost",
};

export default async function MipsPage() {
  await requireUser();

  // Until the live cohort builder is wired in, we render the demo cohort.
  // The agent (mipsExtrapolator) is what production will call.
  const result = extrapolate(demoCohort());

  const rows: MipsMeasureRow[] = result.measures.map((m) => ({
    id: m.measureId,
    measureId: m.measureId,
    title: m.title,
    categoryLabel: CATEGORY_LABELS[m.category as MipsCategory],
    numerator: m.numerator,
    denominator: m.denominator,
    performanceDisplay: `${(m.performance * 100).toFixed(0)}%`,
    performance: m.performance,
    scoreDisplay: m.scorePoints.toFixed(1),
    scorePoints: m.scorePoints,
    blockerCount: m.blockers.length,
  }));

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Platform · EMR-042"
        title="MIPS / MACRA extrapolator"
        description={`Quality, Promoting Interoperability, Improvement Activities, and Cost. Reporting period ${result.reportingPeriodStart} → ${result.reportingPeriodEnd}.`}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <Card tone="raised" className="ring-1 ring-accent/40">
          <CardContent className="pt-6">
            <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">
              Composite score
            </p>
            <p className="font-display text-5xl mt-2 tabular-nums text-accent">
              {result.compositeScore.toFixed(1)}
            </p>
            <p className="text-xs text-text-muted mt-1">
              CMS exceptional performance threshold: 89.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">
              Cohort size
            </p>
            <p className="font-display text-3xl mt-2 tabular-nums">{result.totalPatients}</p>
            <p className="text-xs text-text-muted mt-1">Eligible patients in the period.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">
              Measures evaluated
            </p>
            <p className="font-display text-3xl mt-2 tabular-nums">{result.measures.length}</p>
            <p className="text-xs text-text-muted mt-1">Across four categories.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Category rollup</CardTitle>
          <CardDescription>
            Score points × category weight = composite contribution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {result.categories.map((c) => {
              const pct = c.scorePossible
                ? Math.round((c.scorePoints / c.scorePossible) * 100)
                : 0;
              const weight = result.categoryWeights[c.category as MipsCategory] ?? 0;
              return (
                <div key={c.category}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">
                      {CATEGORY_LABELS[c.category as MipsCategory]}
                    </span>
                    <span className="text-text-muted font-mono">
                      {c.scorePoints.toFixed(1)} / {c.scorePossible}
                      {" pts"} · {Math.round(weight * 100)}% weight ·{" "}
                      <span className="text-accent">{c.weightedScore.toFixed(1)} pt contribution</span>
                    </span>
                  </div>
                  <div className="h-2 bg-surface-muted rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-[#3A8560]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Measure detail — sortable columns + CSV/print export (MASTER prompt G5/G6) */}
      <MipsTable rows={rows} />
    </PageShell>
  );
}
