"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SeasonalSeries } from "./research-data";

// EMR-374 — Seasonal Pattern Detector. A hand-drawn inline SVG area/line chart
// (no chart library) showing how a selected metric's reported outcomes vary
// across the 12 months, plus a named "detected pattern" callout. The metric is
// selectable; the peak month is highlighted on the curve.

const VIEW_W = 720;
const VIEW_H = 240;
const PAD_X = 28;
const PAD_TOP = 24;
const PAD_BOTTOM = 34;

function buildPath(values: number[]): { line: string; area: string; pts: { x: number; y: number }[] } {
  const innerW = VIEW_W - PAD_X * 2;
  const innerH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const pts = values.map((v, i) => {
    const x = PAD_X + (values.length === 1 ? 0 : (i / (values.length - 1)) * innerW);
    const y = PAD_TOP + (1 - v) * innerH;
    return { x, y };
  });
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const baseline = VIEW_H - PAD_BOTTOM;
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${baseline} L${pts[0].x.toFixed(1)},${baseline} Z`;
  return { line, area, pts };
}

export function SeasonalDetector({ series }: { series: SeasonalSeries[] }) {
  const [activeId, setActiveId] = React.useState(series[0]?.id);
  const active = series.find((s) => s.id === activeId) ?? series[0];

  const values = active.points.map((p) => p.value);
  const { line, area, pts } = React.useMemo(() => buildPath(values), [values]);

  const baseline = VIEW_H - PAD_BOTTOM;
  const peak = pts[active.peakMonth];
  const peakPoint = active.points[active.peakMonth];

  return (
    <div>
      {/* Metric selector */}
      <div className="mb-4 flex flex-wrap gap-2">
        {series.map((s) => (
          <Button
            key={s.id}
            variant={s.id === active.id ? "primary" : "secondary"}
            size="sm"
            onClick={() => setActiveId(s.id)}
            aria-pressed={s.id === active.id}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {/* SVG chart */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-muted/40 p-2">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Seasonal reported-outcome curve for ${active.label} across twelve months. ${active.pattern}`}
        >
          <defs>
            <linearGradient id="seasonal-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* baseline */}
          <line
            x1={PAD_X}
            y1={baseline}
            x2={VIEW_W - PAD_X}
            y2={baseline}
            stroke="var(--border)"
            strokeWidth="1"
          />

          {/* area + line */}
          <path d={area} fill="url(#seasonal-fill)" />
          <path
            d={line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* month dots + labels */}
          {pts.map((p, i) => {
            const isPeak = i === active.peakMonth;
            return (
              <g key={i}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isPeak ? 5 : 2.6}
                  fill={isPeak ? "var(--accent)" : "var(--surface, #fff)"}
                  stroke="var(--accent)"
                  strokeWidth={isPeak ? 2 : 1.5}
                />
                <text
                  x={p.x}
                  y={VIEW_H - 12}
                  textAnchor="middle"
                  className="fill-[color:var(--text-subtle)]"
                  style={{ fontSize: 11 }}
                >
                  {active.points[i].month}
                </text>
              </g>
            );
          })}

          {/* peak marker label */}
          <text
            x={Math.min(Math.max(peak.x, PAD_X + 30), VIEW_W - PAD_X - 30)}
            y={Math.max(peak.y - 12, 14)}
            textAnchor="middle"
            className="fill-[color:var(--accent)]"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            Peak · {peakPoint.month}
          </text>
        </svg>
      </div>

      {/* Detected pattern callout */}
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-accent/20 bg-accent-soft px-4 py-3">
        <TrendingUp className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" aria-hidden="true" />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
            Detected pattern · {active.label}
          </p>
          <p className="mt-1 text-sm text-text">{active.pattern}</p>
          <p className="mt-1 text-xs text-text-muted">
            Peak in {peakPoint.month} (n ={" "}
            {peakPoint.sampleSize.toLocaleString("en-US")}) ·{" "}
            {active.points[active.troughMonth].month} is the seasonal low.
          </p>
        </div>
      </div>
    </div>
  );
}
