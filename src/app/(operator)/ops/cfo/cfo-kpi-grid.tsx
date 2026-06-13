"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TrendLine, TrendArea, DistributionBar } from "@/components/charts";
import {
  cycleChartType,
  summarizeSeries,
  formatMetricValue,
  mergeSeriesByLabel,
  type MetricChartType,
  type MetricValueFormat,
} from "@/components/ops/master";

// EMR-1064 — Headline KPIs: keep the compact KpiTile look, but make each tile
// clickable into a drill-in popup (history chart + Google-Finance hover + a
// "feather" chart-type cycle), and let the $-denominated tiles be checkbox-
// selected for a compare overlay. KPIs without a per-period series (the
// balance/cash snapshots) get an honest current-value popup rather than a
// fabricated chart.
//
// Deliberately out of scope here (tracked on EMR-1064): per-tile AI date
// search, the bubble-color system, and drag-rearrange.

export interface CfoKpiView {
  id: string;
  label: string;
  valueDisplay: string;
  changeText: string | null;
  badgeTone: "success" | "danger" | "neutral";
  goalLabel: string | null;
  goalMet: boolean;
  description?: string;
  /** Per-period history; empty when the metric has no series (snapshot KPIs). */
  history: { label: string; value: number }[];
  valueFormat: MetricValueFormat;
  /** Eligible for the multi-select compare overlay (same-unit $ weekly series). */
  compareEligible: boolean;
}

export function CfoKpiGrid({ kpis }: { kpis: CfoKpiView[] }) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [compareOpen, setCompareOpen] = React.useState(false);

  const active = openId ? kpis.find((k) => k.id === openId) ?? null : null;
  const selected = kpis.filter(
    (k) => k.compareEligible && selectedIds.includes(k.id),
  );
  const canCompare = selected.length >= 2;

  const toggle = (id: string, next: boolean) =>
    setSelectedIds((prev) =>
      next ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
    );

  return (
    <div>
      {selectedIds.length > 0 && (
        <div className="mb-3 flex items-center justify-end gap-3">
          <span className="text-xs text-text-muted tabular-nums">
            {selectedIds.length} selected
          </span>
          <button
            type="button"
            disabled={!canCompare}
            onClick={() => setCompareOpen(true)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              canCompare
                ? "bg-accent text-white hover:bg-accent/90 cursor-pointer"
                : "bg-surface-muted text-text-subtle cursor-not-allowed",
            )}
          >
            Compare{canCompare ? ` (${selectedIds.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="text-xs text-text-subtle hover:text-text cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <div key={k.id} className="relative">
            {k.compareEligible && (
              <label
                className={cn(
                  "absolute right-2.5 top-2.5 z-10 flex items-center gap-1 rounded-full border border-border",
                  "bg-surface/90 px-2 py-0.5 text-[9px] font-medium shadow-sm backdrop-blur cursor-pointer select-none",
                  selectedIds.includes(k.id)
                    ? "text-accent"
                    : "text-text-muted hover:text-text",
                )}
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-[color:var(--accent)]"
                  checked={selectedIds.includes(k.id)}
                  onChange={(e) => toggle(k.id, e.target.checked)}
                  aria-label={`Compare ${k.label}`}
                />
                Compare
              </label>
            )}
            <button
              type="button"
              onClick={() => setOpenId(k.id)}
              aria-haspopup="dialog"
              aria-label={`${k.label}: ${k.valueDisplay}. View details`}
              className="group block w-full text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <Card tone="raised" className="card-hover h-full">
                <CardContent className="pt-6 pb-6">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">
                    {k.label}
                  </p>
                  <p className="font-display text-2xl text-text tabular-nums mt-1.5">
                    {k.valueDisplay}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {k.changeText && (
                      <Badge tone={k.badgeTone} className="text-[9px]">
                        {k.changeText} vs prior
                      </Badge>
                    )}
                    {k.goalLabel && (
                      <Badge
                        tone="neutral"
                        className={
                          k.goalMet
                            ? "text-[9px] bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300"
                            : "text-[9px] bg-highlight-soft text-[color:var(--highlight-hover)] border-highlight/25"
                        }
                      >
                        {k.goalLabel}
                      </Badge>
                    )}
                  </div>
                  {k.description && (
                    <p className="text-[11px] text-text-subtle mt-2 leading-snug">
                      {k.description}
                    </p>
                  )}
                  <span className="mt-2 block text-[10px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
                    View details →
                  </span>
                </CardContent>
              </Card>
            </button>
          </div>
        ))}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-2xl">
          {active && <KpiPopup kpi={active} />}
        </DialogContent>
      </Dialog>

      <Dialog open={compareOpen} onOpenChange={(o) => !o && setCompareOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Compare KPIs</DialogTitle>
            {selected.length > 0 && (
              <p className="text-sm text-text-muted">
                {selected.map((s) => s.label).join(" vs ")}
              </p>
            )}
          </DialogHeader>
          {selected.length >= 2 && <CompareChart kpis={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiPopup({ kpi }: { kpi: CfoKpiView }) {
  const [chartType, setChartType] = React.useState<MetricChartType>("line");
  const values = React.useMemo(
    () => kpi.history.map((p) => p.value),
    [kpi.history],
  );
  const summary = React.useMemo(() => summarizeSeries(values), [values]);
  const fmt = React.useCallback(
    (v: number | string) => formatMetricValue(v, kpi.valueFormat),
    [kpi.valueFormat],
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {kpi.label} · {kpi.valueDisplay}
        </DialogTitle>
        {kpi.description && (
          <p className="text-sm text-text-muted">{kpi.description}</p>
        )}
      </DialogHeader>

      {kpi.history.length >= 2 && summary ? (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Stat label="Current" value={fmt(summary.last)} />
            <Stat label="Average" value={fmt(summary.avg)} />
            <Stat label="High" value={fmt(summary.max)} />
            <Stat label="Low" value={fmt(summary.min)} />
          </dl>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
              Trend · {summary.count} points
            </p>
            <button
              type="button"
              onClick={() => setChartType((t) => cycleChartType(t))}
              title="Cycle chart style"
              aria-label={`Change chart style (currently ${chartType})`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-text-muted capitalize transition-colors hover:bg-surface-muted hover:text-text"
            >
              <FeatherIcon className="h-3.5 w-3.5" />
              {chartType}
            </button>
          </div>
          <DrillChart
            chartType={chartType}
            data={kpi.history}
            seriesLabel={kpi.label}
            formatValue={fmt}
          />
        </>
      ) : (
        <div className="py-8 text-center">
          <p className="font-display text-4xl text-text tabular-nums">
            {kpi.valueDisplay}
          </p>
          <p className="mt-3 text-sm text-text-muted">
            No historical series for this metric yet — the trend will appear
            here as periods accrue.
          </p>
        </div>
      )}
    </>
  );
}

function CompareChart({ kpis }: { kpis: CfoKpiView[] }) {
  const fmt = React.useCallback(
    (v: number | string) => formatMetricValue(v, kpis[0]?.valueFormat ?? "number"),
    [kpis],
  );
  const merged = React.useMemo(
    () =>
      mergeSeriesByLabel(
        kpis.map((k) => ({ id: k.id, label: k.label, points: k.history })),
      ),
    [kpis],
  );
  if (merged.disjoint) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">
        These metrics don&rsquo;t share a time axis, so they can&rsquo;t be
        overlaid on one chart.
      </p>
    );
  }
  return (
    <TrendLine
      data={merged.data}
      xKey="label"
      height={320}
      formatValue={fmt}
      lines={merged.lines}
    />
  );
}

function DrillChart({
  chartType,
  data,
  seriesLabel,
  formatValue,
}: {
  chartType: MetricChartType;
  data: { label: string; value: number }[];
  seriesLabel: string;
  formatValue: (value: number | string) => string;
}) {
  const height = 300;
  if (chartType === "bar") {
    return <DistributionBar data={data} height={height} formatValue={formatValue} />;
  }
  if (chartType === "area") {
    return (
      <TrendArea
        data={data}
        xKey="label"
        height={height}
        formatValue={formatValue}
        lines={[{ dataKey: "value", label: seriesLabel }]}
      />
    );
  }
  return (
    <TrendLine
      data={data}
      xKey="label"
      height={height}
      formatValue={formatValue}
      lines={[{ dataKey: "value", label: seriesLabel }]}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-surface px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-subtle">
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-lg text-text tabular-nums leading-none">
        {value}
      </dd>
    </div>
  );
}

function FeatherIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
      <path d="M16 8 2 22" />
      <path d="M17.5 15H9" />
    </svg>
  );
}
