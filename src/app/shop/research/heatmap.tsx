"use client";

import * as React from "react";
import type { HeatmapData, HeatCell, MetricHeatRow } from "./research-data";

// EMR-374 — Patient Trend Heatmap. Pure divs + Tailwind + inline color-mix
// tints (no chart library). Rows = the 6 aggregate metrics, columns = trailing
// 12-week buckets. Every cell is keyboard-focusable with an aria-label, and a
// shared tooltip surfaces metric / period / avg improvement / sample size.

interface HoverState {
  rowIdx: number;
  colIdx: number;
  cell: HeatCell;
  metricLabel: string;
  period: string;
}

function cellBg(score: number): string {
  // color-mix tint of the brand accent; clamp to a readable floor so empty-ish
  // buckets still read as part of the grid.
  const pct = Math.max(6, Math.round(score * 100));
  return `color-mix(in srgb, var(--accent) ${pct}%, transparent)`;
}

export function Heatmap({ data }: { data: HeatmapData }) {
  const [hover, setHover] = React.useState<HoverState | null>(null);

  const handleEnter = (
    row: MetricHeatRow,
    rowIdx: number,
    colIdx: number,
  ) => {
    setHover({
      rowIdx,
      colIdx,
      cell: row.cells[colIdx],
      metricLabel: row.label,
      period: data.weekLabels[colIdx],
    });
  };

  return (
    <div className="relative">
      {/* Column header row */}
      <div
        className="grid items-center gap-1"
        style={{ gridTemplateColumns: `5.5rem repeat(${data.weekLabels.length}, minmax(0, 1fr))` }}
      >
        <span className="text-[11px] font-medium uppercase tracking-wide text-text-subtle">
          Metric
        </span>
        {data.weekLabels.map((w, i) => (
          <span
            key={i}
            className="text-center text-[10px] font-medium text-text-subtle"
          >
            {w}
          </span>
        ))}
      </div>

      {/* Metric rows */}
      <div className="mt-1.5 space-y-1">
        {data.rows.map((row, rowIdx) => (
          <div
            key={row.id}
            className="grid items-center gap-1"
            style={{ gridTemplateColumns: `5.5rem repeat(${row.cells.length}, minmax(0, 1fr))` }}
          >
            <span className="truncate text-[13px] font-medium text-text">
              {row.label}
            </span>
            {row.cells.map((cell, colIdx) => {
              const isActive =
                hover && hover.rowIdx === rowIdx && hover.colIdx === colIdx;
              const label = `${row.label}, ${data.weekLabels[colIdx]}: ${cell.improvementPct}% average reported improvement, sample size ${cell.sampleSize}`;
              return (
                <button
                  key={colIdx}
                  type="button"
                  aria-label={label}
                  onMouseEnter={() => handleEnter(row, rowIdx, colIdx)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => handleEnter(row, rowIdx, colIdx)}
                  onBlur={() => setHover(null)}
                  className={[
                    "h-7 w-full rounded-md border transition-transform duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                    isActive
                      ? "scale-110 border-accent shadow-sm"
                      : "border-border/40 hover:scale-105",
                  ].join(" ")}
                  style={{ backgroundColor: cellBg(cell.score) }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Tooltip / readout */}
      <div className="mt-4 min-h-[3.25rem]" aria-live="polite">
        {hover ? (
          <div className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-surface-raised px-4 py-2.5 shadow-sm">
            <span className="text-sm font-medium text-text">
              {hover.metricLabel}
            </span>
            <span className="text-xs text-text-subtle">{hover.period}</span>
            <span className="text-sm text-accent">
              {hover.cell.improvementPct}% avg improvement
            </span>
            <span className="text-xs text-text-muted">
              n = {hover.cell.sampleSize.toLocaleString("en-US")}
            </span>
          </div>
        ) : (
          <p className="text-xs text-text-subtle">
            Hover or focus any cell to see the period, average reported
            improvement, and sample size.
          </p>
        )}
      </div>

      {/* Intensity legend */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px] text-text-subtle">Lower</span>
        <div className="flex h-3 w-40 overflow-hidden rounded-full border border-border/40">
          {Array.from({ length: 10 }).map((_, i) => (
            <span
              key={i}
              className="flex-1"
              style={{ backgroundColor: cellBg((i + 1) / 10) }}
            />
          ))}
        </div>
        <span className="text-[11px] text-text-subtle">Higher improvement</span>
      </div>
    </div>
  );
}
