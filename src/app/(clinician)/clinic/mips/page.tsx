import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/lib/utils/cn";
import {
  evaluateMips,
  type MeasureSummary,
  type MeasureStatus,
} from "@/lib/billing/mips-calculator";
import { buildDemoMipsDataset } from "@/lib/billing/mips-demo";
import { ScoreGauge } from "./score-gauge";
import { ExportMipsButton } from "./export-button";

export const metadata = { title: "MIPS Quality Dashboard" };

const STATUS_BADGE: Record<MeasureStatus, { tone: "success" | "danger" | "neutral"; label: string }> = {
  met: { tone: "success", label: "Met" },
  not_met: { tone: "danger", label: "Not met" },
  excluded: { tone: "neutral", label: "Excluded" },
};

function formatPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

function formatPeriod(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function adjustmentTone(percent: number): "danger" | "warning" | "accent" | "highlight" {
  if (percent < -3) return "danger";
  if (percent < 0) return "warning";
  if (percent < 4) return "accent";
  return "highlight";
}

function gaugeTone(score: number): "danger" | "warning" | "accent" | "highlight" {
  if (score < 60) return "danger";
  if (score < 75) return "warning";
  if (score < 89) return "accent";
  return "highlight";
}

function PerformanceBar({ value, benchmark }: { value: number; benchmark: number }) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const benchmarkPct = Math.min(Math.max(benchmark, 0), 100);
  const meets = value >= benchmark;
  return (
    <div className="relative h-2.5 w-full rounded-full bg-border/60 overflow-hidden">
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full transition-[width]",
          meets ? "bg-accent" : "bg-[color:var(--highlight-hover)]"
        )}
        style={{ width: `${clamped}%` }}
      />
      <div
        className="absolute inset-y-[-2px] w-px bg-text-subtle/70"
        style={{ left: `${benchmarkPct}%` }}
        aria-label={`Benchmark ${benchmark}%`}
        title={`Benchmark ${benchmark}%`}
      />
    </div>
  );
}

function MeasureBlock({ m }: { m: MeasureSummary }) {
  const met = m.numerator;
  const notMet = m.perPatient.filter((p) => p.status === "not_met").length;
  const meetsBenchmark = m.performanceRate >= m.benchmark;

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-text-subtle">
              {m.cmsId} · {m.domain}
            </p>
            <CardTitle className="text-base mt-1">{m.shortName}</CardTitle>
          </div>
          <Badge tone={meetsBenchmark ? "success" : "warning"} className="shrink-0">
            {m.qualityPoints.toFixed(1)} / 10 pts
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <p className="text-xs text-text-muted leading-relaxed mb-4">
          {m.description}
        </p>
        <div className="flex items-end justify-between mb-2">
          <div>
            <span className="font-display text-3xl text-text tabular-nums">
              {formatPct(m.performanceRate)}
            </span>
            <span className="text-xs text-text-muted ml-2">performance</span>
          </div>
          <div className="text-right text-[11px] text-text-subtle uppercase tracking-wider">
            Benchmark {m.benchmark}%
          </div>
        </div>
        <PerformanceBar value={m.performanceRate} benchmark={m.benchmark} />
        <div className="grid grid-cols-3 gap-3 mt-5 text-center">
          <div className="rounded-lg bg-surface-muted/60 py-2.5">
            <p className="font-display text-lg text-text tabular-nums">{met}</p>
            <p className="text-[10px] uppercase tracking-wider text-text-subtle mt-0.5">Met</p>
          </div>
          <div className="rounded-lg bg-surface-muted/60 py-2.5">
            <p className="font-display text-lg text-text tabular-nums">{notMet}</p>
            <p className="text-[10px] uppercase tracking-wider text-text-subtle mt-0.5">Not met</p>
          </div>
          <div className="rounded-lg bg-surface-muted/60 py-2.5">
            <p className="font-display text-lg text-text tabular-nums">{m.exclusions}</p>
            <p className="text-[10px] uppercase tracking-wider text-text-subtle mt-0.5">Excluded</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryRow({
  label,
  weight,
  raw,
  weighted,
}: {
  label: string;
  weight: number;
  raw: number;
  weighted: number;
}) {
  return (
    <tr className="border-b border-border/30 last:border-0">
      <td className="py-3 pr-4 text-sm text-text">{label}</td>
      <td className="py-3 pr-4 text-right text-xs text-text-muted tabular-nums">
        {(weight * 100).toFixed(0)}%
      </td>
      <td className="py-3 pr-4 text-right text-sm text-text tabular-nums">
        {raw.toFixed(1)}
      </td>
      <td className="py-3 text-right font-medium text-sm text-text tabular-nums">
        {weighted.toFixed(1)}
      </td>
    </tr>
  );
}

export default function MipsDashboardPage() {
  const datasets = buildDemoMipsDataset();
  const evaluation = evaluateMips(datasets);
  const allPatientRows = evaluation.quality.measures.flatMap((m) =>
    m.perPatient.map((p) => ({ ...p, measureShort: m.shortName, measureId: m.id }))
  );
  const adjTone = adjustmentTone(evaluation.paymentAdjustmentPercent);
  const adjSign = evaluation.paymentAdjustmentPercent >= 0 ? "+" : "";

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <PageHeader
        eyebrow="Quality · CY2024"
        title="MIPS Dashboard"
        description="Live extrapolation of CMS quality-measure performance from your patient encounters, SOAP notes, and patient messages. Projects your final MIPS composite and CY2026 payment adjustment."
        actions={<ExportMipsButton evaluation={evaluation} />}
      />

      {/* Top hero: gauge + adjustment + headline counters */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10">
        <Card className="lg:col-span-5 rounded-2xl shadow-sm">
          <CardContent className="flex items-center gap-6 py-8">
            <ScoreGauge
              value={evaluation.finalScore}
              label="Final score"
              tone={gaugeTone(evaluation.finalScore)}
            />
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">
                Projected payment adjustment
              </p>
              <p
                className={cn(
                  "font-display text-5xl tabular-nums mt-1",
                  adjTone === "danger" && "text-danger",
                  adjTone === "warning" && "text-[color:var(--highlight-hover)]",
                  adjTone === "accent" && "text-accent",
                  adjTone === "highlight" && "text-[color:var(--highlight)]"
                )}
              >
                {adjSign}
                {evaluation.paymentAdjustmentPercent.toFixed(2)}%
              </p>
              <div className="flex items-center gap-2 mt-3">
                {evaluation.isPenalty ? (
                  <Badge tone="danger">Below 75 pt floor</Badge>
                ) : evaluation.isExceptional ? (
                  <Badge tone="highlight">Exceptional performer</Badge>
                ) : (
                  <Badge tone="success">Positive adjustment</Badge>
                )}
                <span className="text-[11px] text-text-subtle">
                  Applied to Medicare Part B claims CY2026
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 rounded-2xl shadow-sm">
          <CardContent className="py-8 text-center">
            <p className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">
              Quality category
            </p>
            <p className="font-display text-5xl text-text tabular-nums mt-2">
              {evaluation.quality.categoryScore.toFixed(1)}
            </p>
            <p className="text-[11px] text-text-subtle mt-1">
              {evaluation.quality.totalEarned.toFixed(1)} / {evaluation.quality.totalAvailable} pts
            </p>
            <div className="mt-4 h-2 w-full rounded-full bg-border/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(evaluation.quality.categoryScore, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 rounded-2xl shadow-sm">
          <CardContent className="py-8 text-center">
            <p className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">
              Patients
            </p>
            <p className="font-display text-5xl text-text tabular-nums mt-2">
              {evaluation.patientCount}
            </p>
            <p className="text-[11px] text-text-subtle mt-1">in cohort</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 rounded-2xl shadow-sm">
          <CardContent className="py-8 text-center">
            <p className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">
              Reporting window
            </p>
            <p className="text-sm text-text mt-2 font-medium">
              {formatPeriod(evaluation.reportingPeriod.start)}
            </p>
            <p className="text-[11px] text-text-subtle">to</p>
            <p className="text-sm text-text font-medium">
              {formatPeriod(evaluation.reportingPeriod.end)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-measure cards */}
      <h2 className="font-display text-xl text-text mb-4 tracking-tight">
        Quality measures
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
        {evaluation.quality.measures.map((m) => (
          <MeasureBlock key={m.id} m={m} />
        ))}
      </div>

      {/* Composite category breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-10">
        <Card className="lg:col-span-3 rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Composite score breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-text-subtle border-b border-border">
                  <th className="py-2 pr-4 text-left font-medium">Category</th>
                  <th className="py-2 pr-4 text-right font-medium">Weight</th>
                  <th className="py-2 pr-4 text-right font-medium">Raw</th>
                  <th className="py-2 text-right font-medium">Weighted</th>
                </tr>
              </thead>
              <tbody>
                <CategoryRow
                  label="Quality"
                  weight={evaluation.categories.quality.weight}
                  raw={evaluation.categories.quality.raw}
                  weighted={evaluation.categories.quality.weighted}
                />
                <CategoryRow
                  label="Promoting Interoperability"
                  weight={evaluation.categories.pi.weight}
                  raw={evaluation.categories.pi.raw}
                  weighted={evaluation.categories.pi.weighted}
                />
                <CategoryRow
                  label="Improvement Activities"
                  weight={evaluation.categories.ia.weight}
                  raw={evaluation.categories.ia.raw}
                  weighted={evaluation.categories.ia.weighted}
                />
                <CategoryRow
                  label="Cost"
                  weight={evaluation.categories.cost.weight}
                  raw={evaluation.categories.cost.raw}
                  weighted={evaluation.categories.cost.weighted}
                />
                <tr>
                  <td className="pt-4 text-sm font-medium text-text">Final composite</td>
                  <td className="pt-4 pr-4 text-right text-xs text-text-muted">—</td>
                  <td className="pt-4 pr-4 text-right text-xs text-text-muted">—</td>
                  <td className="pt-4 text-right font-display text-lg text-text tabular-nums">
                    {evaluation.finalScore.toFixed(1)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Action items</CardTitle>
          </CardHeader>
          <CardContent>
            {evaluation.actionItems.length === 0 ? (
              <p className="text-sm text-text-muted">
                All reported measures are above benchmark. Sustain current documentation cadence.
              </p>
            ) : (
              <ul className="space-y-3">
                {evaluation.actionItems.map((a) => (
                  <li
                    key={a.measureId}
                    className="flex items-start gap-3 pb-3 border-b border-border/30 last:border-0 last:pb-0"
                  >
                    <Badge
                      tone={
                        a.priority === "high"
                          ? "danger"
                          : a.priority === "medium"
                          ? "warning"
                          : "neutral"
                      }
                      className="shrink-0 mt-0.5"
                    >
                      {a.priority}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium text-text">{a.title}</p>
                      <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                        {a.gap} open chart{a.gap === 1 ? "" : "s"} · {a.impact}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contributing patient list */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Contributing patients</CardTitle>
          <p className="text-xs text-text-muted mt-1">
            Per-measure status for every patient in the denominator. Use this list to triage
            chart closures.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-text-subtle border-b-2 border-border">
                  <th className="py-3 pr-4">Patient</th>
                  <th className="py-3 pr-4">Measure</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {allPatientRows.map((row, i) => {
                  const badge = STATUS_BADGE[row.status];
                  return (
                    <tr
                      key={`${row.measureId}-${row.patientId}-${i}`}
                      className="border-b border-border/30 last:border-0 hover:bg-surface-muted/40 transition-colors"
                    >
                      <td className="py-3 pr-4 text-sm text-text">
                        {row.patientDisplay ?? row.patientId}
                      </td>
                      <td className="py-3 pr-4 text-sm text-text-muted">{row.measureShort}</td>
                      <td className="py-3 pr-4">
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </td>
                      <td className="py-3 text-xs text-text-muted">{row.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-text-subtle text-center mt-8 leading-relaxed">
        MIPS projection is informational. Final adjustments are determined by CMS after
        Quality Payment Program submission. Benchmarks reflect CY2024 published decile-10
        thresholds; cost-category and PI scores are placeholders until live attestation data is wired in.
      </p>
    </PageShell>
  );
}
