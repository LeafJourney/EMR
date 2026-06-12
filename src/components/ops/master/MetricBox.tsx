"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TrendLine, TrendArea, DistributionBar } from "@/components/charts";
import { MiniSparkline } from "@/components/ui/mini-sparkline";
import {
  cycleChartType,
  summarizeSeries,
  formatMetricValue,
  type MetricChartType,
  type MetricValueFormat,
} from "./metric-box-utils";

// ---------------------------------------------------------------------------
// MetricBox — MASTER-prompt G9/G10/G11 "click a box → popup" primitive.
//
// The Owner Portal Revisions doc asks, on nearly every dashboard tile:
//   • G10 "click a box → popup with full historical/chronological data,
//          beautiful charts; 'feather' icon re-beautifies / cycles chart types"
//   • G11 "hover a datapoint → show value + time (Google-Finance style)"
//
// MetricBox renders an Apple-iOS-ish KPI tile that, on click, opens a Dialog
// with the metric's history rendered through the branded chart wrappers
// (which already carry the hover ChartTooltip), plus a "feather" button that
// cycles line → area → bar. The tile also shows an inline sparkline so the
// trend reads at a glance before the operator even opens the popup.
//
// History is passed in as plain serializable data so a Server Component page
// can render this Client primitive directly with real (never fabricated)
// series.
// ---------------------------------------------------------------------------

export interface MetricPoint {
  /** x-axis label (week / month / date). */
  label: string;
  /** y-axis numeric value, in the unit implied by `valueFormat`. */
  value: number;
}

export interface MetricBoxProps {
  /** Small uppercase label on the tile. */
  eyebrow: string;
  /** Big headline value, already formatted by the caller (e.g. "$1.2M"). */
  headline: React.ReactNode;
  /** aria fallback used when `headline` is a non-string ReactNode. */
  headlineLabel?: string;
  /** Optional one-line hint under the headline. */
  subtext?: string;
  /** Historical series powering the drill-in popup + inline sparkline. */
  history: MetricPoint[];
  /** Dialog title (defaults to `eyebrow`). */
  popupTitle?: string;
  /** Longer description shown under the popup title. */
  popupDescription?: string;
  /** How to format y-values in the chart tooltip + summary stats. */
  valueFormat?: MetricValueFormat;
  /** Whether a rising series is good (revenue) or bad (denials, AR days). */
  goodWhen?: "up" | "down" | "either";
  /** Initial chart style in the popup. Default "line". */
  initialChartType?: MetricChartType;
  /** Optional deep-link rendered as "View details →" in the popup footer. */
  detailHref?: string;
  detailLabel?: string;
  /**
   * Render a compare checkbox in the top-right corner and report selection up
   * (MASTER prompt G9). Managed by <MetricBoxGroup>, which overlays the
   * selected metrics on one chart.
   */
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (next: boolean) => void;
  className?: string;
}

export function MetricBox({
  eyebrow,
  headline,
  headlineLabel,
  subtext,
  history,
  popupTitle,
  popupDescription,
  valueFormat = "number",
  goodWhen = "either",
  initialChartType = "line",
  detailHref,
  detailLabel = "View details",
  selectable = false,
  selected = false,
  onSelectedChange,
  className,
}: MetricBoxProps) {
  const [open, setOpen] = React.useState(false);
  const [chartType, setChartType] =
    React.useState<MetricChartType>(initialChartType);

  const values = React.useMemo(() => history.map((p) => p.value), [history]);
  const summary = React.useMemo(() => summarizeSeries(values), [values]);
  const hasHistory = history.length >= 2;

  const fmt = React.useCallback(
    (v: number | string) => formatMetricValue(v, valueFormat),
    [valueFormat],
  );

  const headlineAria =
    headlineLabel ??
    (typeof headline === "string" || typeof headline === "number"
      ? String(headline)
      : eyebrow);

  // Trend semantics: is the first→last movement good, bad, or neutral?
  const isGood =
    !summary || summary.direction === "flat" || goodWhen === "either"
      ? null
      : (goodWhen === "up" && summary.direction === "up") ||
        (goodWhen === "down" && summary.direction === "down");

  return (
    <>
      <div className="relative">
        {selectable && (
          <label
            className={cn(
              "absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border border-border",
              "bg-surface/90 px-2 py-0.5 text-[10px] font-medium shadow-sm backdrop-blur",
              "cursor-pointer select-none",
              selected ? "text-accent" : "text-text-muted hover:text-text",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              className="h-3 w-3 accent-[color:var(--accent)]"
              checked={selected}
              onChange={(e) => onSelectedChange?.(e.target.checked)}
              aria-label={`Compare ${eyebrow}`}
            />
            Compare
          </label>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`${eyebrow}: ${headlineAria}. Open details`}
          className={cn(
            "group relative block w-full text-left rounded-2xl border border-border/80 bg-surface-raised",
          "shadow-sm transition-all duration-200 ease-smooth",
          "hover:shadow-md hover:-translate-y-0.5 hover:border-border-strong",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "px-6 py-6 [.density-dense_&]:px-4 [.density-dense_&]:py-4",
          className,
        )}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
          {eyebrow}
        </p>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-3xl font-semibold text-text tabular-nums leading-none">
            {headline}
          </span>
          {summary && summary.direction !== "flat" && (
            <TrendBadge
              direction={summary.direction}
              deltaPct={summary.deltaPct}
              isGood={isGood}
            />
          )}
        </div>

        {subtext && (
          <p className="text-xs text-text-muted mt-3 leading-snug">{subtext}</p>
        )}

        {hasHistory && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <MiniSparkline values={values} width={88} height={20} />
            <span className="text-[10px] font-medium text-text-subtle opacity-0 transition-opacity group-hover:opacity-100">
              Tap to expand
            </span>
          </div>
        )}
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{popupTitle ?? eyebrow}</DialogTitle>
            {popupDescription && (
              <p className="text-sm text-text-muted">{popupDescription}</p>
            )}
          </DialogHeader>

          {summary ? (
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
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1",
                    "text-[11px] font-medium text-text-muted capitalize",
                    "transition-colors hover:bg-surface-muted hover:text-text",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  )}
                >
                  <FeatherIcon className="h-3.5 w-3.5" />
                  {chartType}
                </button>
              </div>

              <DrillChart
                chartType={chartType}
                data={history}
                seriesLabel={popupTitle ?? eyebrow}
                formatValue={fmt}
              />
            </>
          ) : (
            <p className="py-10 text-center text-sm text-text-muted">
              No history yet — the trend will appear here once data starts
              flowing.
            </p>
          )}

          {detailHref && (
            <div className="mt-5 flex justify-end border-t border-border/60 pt-4">
              <Link
                href={detailHref}
                className="text-sm font-medium text-accent hover:underline"
              >
                {detailLabel} &rarr;
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
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

function DrillChart({
  chartType,
  data,
  seriesLabel,
  formatValue,
}: {
  chartType: MetricChartType;
  data: MetricPoint[];
  seriesLabel: string;
  formatValue: (value: number | string) => string;
}) {
  const height = 300;
  if (chartType === "bar") {
    return (
      <DistributionBar
        data={data}
        height={height}
        formatValue={formatValue}
      />
    );
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

function TrendBadge({
  direction,
  deltaPct,
  isGood,
}: {
  direction: "up" | "down" | "flat";
  deltaPct: number | null;
  isGood: boolean | null;
}) {
  const arrow = direction === "up" ? "↑" : "↓";
  const pct =
    deltaPct === null ? "new" : `${Math.abs(deltaPct).toFixed(0)}%`;
  const color =
    isGood === null
      ? "text-text-muted"
      : isGood
        ? "text-accent"
        : "text-danger";
  return (
    <span className={cn("text-xs font-medium tabular-nums", color)}>
      {arrow} {pct}
    </span>
  );
}

function FeatherIcon({ className }: { className?: string }) {
  // A simple feather outline — the doc's "feather" beautify affordance.
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
