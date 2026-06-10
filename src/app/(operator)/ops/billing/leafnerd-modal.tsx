"use client";

/**
 * LeafNerdModal — EMR-937.
 *
 * A clickable KPI tile opens this popup, which charts the metric's history
 * across four granularities: day / week / month / year. The analytics brand
 * is "LeafNerd".
 *
 * We don't have a real time-series table for these aggregates, so the history
 * is deterministic synthetic data seeded from the metric key + the current
 * value (consistent with the codebase's stubbing style — stable across
 * renders, no random flicker). The most-recent bucket always equals the live
 * KPI value so the chart reconciles with the tile the user clicked.
 */

import * as React from "react";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export type MetricKey = "totalBilled" | "collected" | "pendingRevenue" | "outstanding";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

type Granularity = "day" | "week" | "month" | "year";

const GRANULARITIES: { key: Granularity; label: string; buckets: number }[] = [
  { key: "day", label: "Day", buckets: 14 },
  { key: "week", label: "Week", buckets: 12 },
  { key: "month", label: "Month", buckets: 12 },
  { key: "year", label: "Year", buckets: 5 },
];

const BAR_FILL: Record<Tone, string> = {
  neutral: "fill-[color:var(--accent)]",
  accent: "fill-[color:var(--accent)]",
  success: "fill-[color:var(--success)]",
  warning: "fill-[color:var(--warning)]",
  danger: "fill-[color:var(--danger)]",
  info: "fill-[color:var(--info)]",
};

// Tiny deterministic PRNG (mulberry32) so synthetic history is stable.
function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Bucket {
  label: string;
  value: number;
}

function bucketLabels(g: Granularity, n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    if (g === "day") {
      d.setDate(now.getDate() - i);
      out.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    } else if (g === "week") {
      d.setDate(now.getDate() - i * 7);
      out.push(`Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    } else if (g === "month") {
      d.setMonth(now.getMonth() - i);
      out.push(d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }));
    } else {
      d.setFullYear(now.getFullYear() - i);
      out.push(String(d.getFullYear()));
    }
  }
  return out;
}

function buildSeries(
  metricKey: MetricKey,
  g: Granularity,
  current: number,
): Bucket[] {
  const { buckets } = GRANULARITIES.find((x) => x.key === g)!;
  const labels = bucketLabels(g, buckets);
  const rng = mulberry32(hashSeed(`${metricKey}:${g}`));

  // Build a gently trending walk that lands on `current` for the last bucket.
  const noise: number[] = [];
  let acc = 1;
  for (let i = 0; i < buckets; i++) {
    // upward drift + bounded jitter
    acc *= 0.86 + rng() * 0.32; // 0.86..1.18
    noise.push(acc);
  }
  const last = noise[noise.length - 1] || 1;
  const base = current > 0 ? current : 100;
  return labels.map((label, i) => ({
    label,
    value: Math.max(0, Math.round((noise[i] / last) * base)),
  }));
}

export function LeafNerdModal({
  metricKey,
  label,
  currentValue,
  format,
  tone,
  onClose,
}: {
  metricKey: MetricKey;
  label: string;
  currentValue: number;
  format: "money" | "count";
  tone: Tone;
  onClose: () => void;
}) {
  const [granularity, setGranularity] = React.useState<Granularity>("month");

  const series = React.useMemo(
    () => buildSeries(metricKey, granularity, currentValue),
    [metricKey, granularity, currentValue],
  );

  const max = Math.max(1, ...series.map((b) => b.value));
  const fmt = (v: number) => (format === "money" ? formatMoney(v) : v.toLocaleString("en-US"));

  // Close on Escape.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // SVG bar-chart geometry.
  const W = 720;
  const H = 240;
  const padL = 8;
  const padR = 8;
  const padTop = 12;
  const padBottom = 28;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;
  const slot = plotW / series.length;
  const barW = Math.max(4, slot * 0.62);

  const avg =
    series.reduce((acc, b) => acc + b.value, 0) / (series.length || 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`LeafNerd analytics — ${label}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-border bg-surface-raised shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-border">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold flex items-center gap-1.5">
              <span aria-hidden="true">🌿</span> LeafNerd Analytics
            </p>
            <h2 className="font-display text-xl text-text mt-0.5">{label}</h2>
            <p className="text-sm text-text-muted mt-0.5">
              History by {granularity} · current {fmt(currentValue)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-text-subtle hover:text-text rounded-md p-1 -mr-1 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Granularity switch */}
        <div className="flex items-center gap-1.5 px-6 pt-4">
          {GRANULARITIES.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGranularity(g.key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                granularity === g.key
                  ? "bg-accent text-accent-ink shadow-sm"
                  : "bg-surface-muted text-text-muted hover:bg-surface border border-border",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="px-6 py-5">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto"
            role="img"
            aria-label={`${label} bar chart by ${granularity}`}
          >
            {/* average line */}
            {(() => {
              const y = padTop + plotH - (avg / max) * plotH;
              return (
                <g>
                  <line
                    x1={padL}
                    x2={W - padR}
                    y1={y}
                    y2={y}
                    className="stroke-border"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={W - padR}
                    y={y - 4}
                    textAnchor="end"
                    className="fill-text-subtle"
                    fontSize="10"
                  >
                    avg {fmt(Math.round(avg))}
                  </text>
                </g>
              );
            })()}

            {series.map((b, i) => {
              const x = padL + i * slot + (slot - barW) / 2;
              const h = (b.value / max) * plotH;
              const y = padTop + plotH - h;
              const isLast = i === series.length - 1;
              return (
                <g key={`${b.label}-${i}`}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(1, h)}
                    rx={2}
                    className={cn(BAR_FILL[tone], isLast ? "opacity-100" : "opacity-70")}
                  >
                    <title>{`${b.label}: ${fmt(b.value)}`}</title>
                  </rect>
                  {/* sparse x labels to avoid clutter */}
                  {(series.length <= 12 || i % 2 === 0) && (
                    <text
                      x={x + barW / 2}
                      y={H - 8}
                      textAnchor="middle"
                      className="fill-text-subtle"
                      fontSize="9"
                    >
                      {b.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Footer summary */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 px-6 pb-5 text-sm">
          <Summary label="Latest" value={fmt(series[series.length - 1]?.value ?? 0)} />
          <Summary label="Average" value={fmt(Math.round(avg))} />
          <Summary label="Peak" value={fmt(max)} />
          <span className="text-[11px] text-text-subtle ml-auto">
            Synthetic LeafNerd preview · reconciled to live total
          </span>
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-text-subtle">{label}</p>
      <p className="font-display tabular-nums text-text">{value}</p>
    </div>
  );
}
