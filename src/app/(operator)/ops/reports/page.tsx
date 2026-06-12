// EMR-097 — Data Research & Reports Module.
//
// "Accounting software for clinical data." The operator picks a
// dimension + metric + chart kind, and the page renders the result
// as a recharts visualization plus a backing data table. Saved
// templates are surfaced as one-click buttons that populate the
// querystring with a ready-made spec.

import Link from "next/link";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { ReportsTable, type ReportDataRow } from "./reports-table";
import { ReportChart } from "@/components/analytics/report-chart";
import {
  renderReport,
  type ClinicalDimension,
  type ClinicalMetric,
  type ReportKind,
  type ReportSpec,
} from "@/lib/research/reports";

export const metadata = { title: "Reports" };

interface PageProps {
  searchParams: {
    kind?: string;
    dimension?: string;
    metric?: string;
    horizon?: string;
  };
}

const KIND_OPTIONS: { value: ReportKind; label: string }[] = [
  { value: "bar", label: "Bar chart" },
  { value: "pie", label: "Pie chart" },
  { value: "line", label: "Line trend" },
  { value: "projection", label: "Projection" },
  { value: "pivot", label: "Pivot table" },
];

const DIMENSION_OPTIONS: { value: ClinicalDimension; label: string }[] = [
  { value: "conditions", label: "Conditions" },
  { value: "products", label: "Products" },
  { value: "outcomes", label: "Outcomes (improvement band)" },
  { value: "providers", label: "Providers" },
  { value: "payers", label: "Payers" },
  { value: "age_band", label: "Age band" },
  { value: "sex", label: "Sex" },
  { value: "month", label: "Month" },
];

const METRIC_OPTIONS: { value: ClinicalMetric; label: string }[] = [
  { value: "patient_count", label: "Patient count" },
  { value: "outcome_log_count", label: "Outcome log count" },
  { value: "avg_pain_reduction", label: "Avg pain reduction (NRS)" },
  { value: "avg_sleep_improvement", label: "Avg sleep improvement" },
  { value: "rx_count", label: "Rx count" },
  { value: "revenue_cents", label: "Revenue (cents)" },
];

const TEMPLATES: Array<{ id: string; label: string; spec: Omit<ReportSpec, "id" | "title"> }> = [
  {
    id: "patients-by-condition",
    label: "Patients by condition",
    spec: { kind: "bar", dimension: "conditions", metric: "patient_count" },
  },
  {
    id: "pain-reduction-by-product",
    label: "Pain reduction by product",
    spec: { kind: "bar", dimension: "products", metric: "avg_pain_reduction" },
  },
  {
    id: "payer-mix",
    label: "Payer mix",
    spec: { kind: "pie", dimension: "payers", metric: "revenue_cents" },
  },
  {
    id: "rx-trend",
    label: "Monthly Rx trend",
    spec: { kind: "line", dimension: "month", metric: "rx_count" },
  },
  {
    id: "revenue-projection",
    label: "Revenue projection (3 mo)",
    spec: { kind: "projection", dimension: "month", metric: "revenue_cents", horizonMonths: 3 },
  },
];

function parseKind(raw: string | undefined): ReportKind {
  return KIND_OPTIONS.find((k) => k.value === raw)?.value ?? "bar";
}

function parseDimension(raw: string | undefined): ClinicalDimension {
  return (DIMENSION_OPTIONS.find((d) => d.value === raw)?.value ?? "conditions") as ClinicalDimension;
}

function parseMetric(raw: string | undefined): ClinicalMetric {
  return (METRIC_OPTIONS.find((m) => m.value === raw)?.value ?? "patient_count") as ClinicalMetric;
}

export default function ReportsPage({ searchParams }: PageProps) {
  const kind = parseKind(searchParams.kind);
  const dimension = parseDimension(searchParams.dimension);
  const metric = parseMetric(searchParams.metric);
  const horizonMonths = searchParams.horizon
    ? Math.max(1, Math.min(12, parseInt(searchParams.horizon, 10) || 3))
    : 3;

  const spec: ReportSpec = {
    id: "current",
    title: `${METRIC_OPTIONS.find((m) => m.value === metric)?.label} by ${DIMENSION_OPTIONS.find((d) => d.value === dimension)?.label}`,
    kind,
    dimension,
    metric,
    horizonMonths,
  };
  const report = renderReport(spec);
  const isCurrency = metric === "revenue_cents";

  function fmt(v: number): string {
    if (isCurrency) {
      return `$${(v / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  const dimensionLabel =
    DIMENSION_OPTIONS.find((d) => d.value === dimension)?.label ?? "Dimension";

  const reportRows: ReportDataRow[] = report.rows.map((r) => ({
    id: r.label,
    label: r.label,
    valueDisplay: fmt(r.value),
    value: r.value,
    forecast: r.forecast ?? false,
  }));

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Reports"
        title="Data research &amp; reports"
        description="Pivot on any dimension, pick a metric, and render the answer as a bar, pie, line, or projection. Save the querystring or use a template — the spec is the report."
      />

      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle>Saved templates</CardTitle>
          <CardDescription>
            One-click starting points. Tweak the form below to make them your own.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => {
              const p = new URLSearchParams();
              p.set("kind", t.spec.kind);
              p.set("dimension", t.spec.dimension);
              p.set("metric", t.spec.metric);
              if (t.spec.horizonMonths) p.set("horizon", String(t.spec.horizonMonths));
              return (
                <Link
                  key={t.id}
                  href={`/ops/reports?${p.toString()}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border border-border bg-surface hover:bg-surface-muted text-text-muted hover:text-text"
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle>Build a report</CardTitle>
          <CardDescription>
            Dimension drives the X axis (or pie slices). Metric drives the Y axis. Chart
            kind drives the rendering.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action="/ops/reports"
            method="get"
            className="grid grid-cols-1 md:grid-cols-4 gap-4"
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-subtle uppercase tracking-wider">
                Chart kind
              </span>
              <select
                name="kind"
                defaultValue={kind}
                className="bg-surface border border-border rounded-md px-3 py-2 text-sm"
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-subtle uppercase tracking-wider">
                Dimension
              </span>
              <select
                name="dimension"
                defaultValue={dimension}
                className="bg-surface border border-border rounded-md px-3 py-2 text-sm"
              >
                {DIMENSION_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-subtle uppercase tracking-wider">
                Metric
              </span>
              <select
                name="metric"
                defaultValue={metric}
                className="bg-surface border border-border rounded-md px-3 py-2 text-sm"
              >
                {METRIC_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-subtle uppercase tracking-wider">
                Horizon (months)
              </span>
              <input
                name="horizon"
                type="number"
                min={1}
                max={12}
                defaultValue={horizonMonths}
                className="bg-surface border border-border rounded-md px-3 py-2 text-sm"
              />
            </label>
            <div className="md:col-span-4 flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-md text-sm font-medium bg-accent text-accent-ink hover:bg-accent/90"
              >
                Render report →
              </button>
              <Link
                href="/ops/reports"
                className="text-sm text-text-muted hover:text-text"
              >
                Reset
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Rows" value={String(report.rows.filter((r) => !r.forecast).length)} size="md" />
        <StatCard label="Total" value={fmt(report.total)} size="md" tone="info" />
        <StatCard label="Mean" value={fmt(report.mean)} size="md" tone="success" />
        <StatCard label="Std dev" value={fmt(report.stddev)} size="md" tone="neutral" />
      </div>

      <Card tone="raised" className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{spec.title}</CardTitle>
              <CardDescription>
                {kind === "projection"
                  ? `Linear forecast extending ${horizonMonths} month(s).`
                  : "Live render from the demo fact table."}
              </CardDescription>
            </div>
            <Badge tone="accent">{kind}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ReportChart report={report} />
        </CardContent>
      </Card>

      <Card tone="raised">
        <CardHeader>
          <CardTitle>Backing data</CardTitle>
          <CardDescription>
            Every chart is a table underneath. Copy this out, or use the export builder for
            de-identified research extracts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReportsTable rows={reportRows} dimensionLabel={dimensionLabel} />
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-text-muted">
            <Link
              href="/ops/research-exports/builder"
              className="text-accent hover:underline"
            >
              Open de-identified export builder →
            </Link>
            <Link
              href="/clinic/library/cannabis-library"
              className="text-accent hover:underline"
            >
              Open cannabis library →
            </Link>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
