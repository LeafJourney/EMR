"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TrendLine } from "@/components/charts";
import { MetricBox, type MetricBoxProps } from "./MetricBox";
import {
  mergeSeriesByLabel,
  formatMetricValue,
  type MetricValueFormat,
} from "./metric-box-utils";

// ---------------------------------------------------------------------------
// MetricBoxGroup — MASTER-prompt G9 "compare mode".
//
// "Small checkbox top-right of each box → select ≥2 → a Compare button appears
//  → popup overlays the measures on one chart."
//
// Wraps a set of <MetricBox> tiles, manages which are checked, and overlays the
// selected metrics' real histories on a single multi-line TrendLine (shared
// hover tooltips, money/percent formatting). Metrics that don't share a time
// axis are flagged instead of drawn as misleading parallel lines.
// ---------------------------------------------------------------------------

export interface MetricBoxGroupItem extends MetricBoxProps {
  /** Stable id used for selection state + compare-series keys. */
  id: string;
  /** Optional explicit color for this metric's compare line. */
  compareColor?: string;
}

export interface MetricBoxGroupProps {
  metrics: MetricBoxGroupItem[];
  /** Grid classes for the tile layout (e.g. "grid grid-cols-3 gap-4"). */
  className?: string;
  /** Title for the compare popup. */
  compareTitle?: string;
  /** Value format for the merged compare chart (all metrics share it). */
  valueFormat?: MetricValueFormat;
}

export function MetricBoxGroup({
  metrics,
  className,
  compareTitle = "Compare metrics",
  valueFormat = "number",
}: MetricBoxGroupProps) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [compareOpen, setCompareOpen] = React.useState(false);

  const toggle = (id: string, next: boolean) =>
    setSelectedIds((prev) =>
      next ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
    );

  const selected = metrics.filter((m) => selectedIds.includes(m.id));
  const canCompare = selected.length >= 2;

  const fmt = React.useCallback(
    (v: number | string) => formatMetricValue(v, valueFormat),
    [valueFormat],
  );

  const merged = React.useMemo(
    () =>
      mergeSeriesByLabel(
        selected.map((m) => ({
          id: m.id,
          label: m.popupTitle ?? m.eyebrow,
          points: m.history,
          color: m.compareColor,
        })),
      ),
    [selected],
  );

  return (
    <div>
      {/* Compare toolbar — surfaces selection + the Compare action (G9). */}
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

      <div className={className}>
        {metrics.map((m) => {
          // Strip group-only props before forwarding to the tile.
          const { id, compareColor: _compareColor, ...boxProps } = m;
          return (
            <MetricBox
              key={id}
              {...boxProps}
              selectable
              selected={selectedIds.includes(id)}
              onSelectedChange={(next) => toggle(id, next)}
            />
          );
        })}
      </div>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{compareTitle}</DialogTitle>
            {selected.length > 0 && (
              <p className="text-sm text-text-muted">
                {selected.map((m) => m.popupTitle ?? m.eyebrow).join(" vs ")}
              </p>
            )}
          </DialogHeader>
          {merged.disjoint ? (
            <p className="py-10 text-center text-sm text-text-muted">
              These metrics don&rsquo;t share a time axis, so they can&rsquo;t be
              overlaid on one chart. Pick metrics from the same period (e.g. two
              weekly tiles).
            </p>
          ) : (
            <TrendLine
              data={merged.data}
              xKey="label"
              height={320}
              formatValue={fmt}
              lines={merged.lines}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
