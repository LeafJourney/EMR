"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Sparkline } from "@/components/ui/sparkline";
import { formatMoneyCompact } from "@/lib/utils/format";

// ---------------------------------------------------------------------------
// Clickable balance / breakdown metric (Dr. Patel directive — billing).
// Wraps a server-rendered metric tile in a button that opens a trend popup:
// a month-to-month cumulative graph (or a deductible fill bar) plus a
// searchable, time/amount-filterable list of the contributing activity.
// Money/dates are pre-formatted server-side so this stays prisma-free.
// ---------------------------------------------------------------------------

export interface TrendItem {
  id: string;
  description: string;
  dateLabel: string;
  /** occurredAt epoch ms — drives the time-range filter. */
  ts: number;
  /** Signed, formatted amount, e.g. "+$120.00" / "−$40.00". */
  amountLabel: string;
  signedCents: number;
}

export interface MetricTrendData {
  label: string;
  /** Formatted current value of the metric. */
  currentValue: string;
  points: { label: string; cents: number }[];
  items: TrendItem[];
  variant?: "cumulative" | "fill";
  /** Deductible-style fill bar. */
  fill?: {
    metLabel: string;
    totalLabel: string;
    remainingLabel: string;
    pct: number;
  };
  /** Honest framing line shown under the chart. */
  note?: string;
}

const RANGES: { key: string; label: string; months: number | null }[] = [
  { key: "all", label: "All time", months: null },
  { key: "12m", label: "12 mo", months: 12 },
  { key: "6m", label: "6 mo", months: 6 },
  { key: "3m", label: "3 mo", months: 3 },
];

export function MetricDrilldown({
  data,
  children,
}: {
  data: MetricTrendData;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative w-full text-left rounded-lg pr-5 transition-colors hover:bg-surface-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        aria-label={`${data.label} — open trend`}
      >
        {children}
        <span
          className="absolute top-1 right-1 text-text-subtle/0 group-hover:text-text-subtle transition-colors"
          aria-hidden
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 11l3.5-4 2.5 2.5L14 4"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      <TrendModal data={data} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function TrendModal({
  data,
  open,
  onClose,
}: {
  data: MetricTrendData;
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("all");
  const [minAmount, setMinAmount] = useState("");

  const maxTs = useMemo(
    () => data.items.reduce((m, i) => Math.max(m, i.ts), 0),
    [data.items],
  );

  const filtered = useMemo(() => {
    const months = RANGES.find((r) => r.key === range)?.months ?? null;
    const cutoff =
      months != null ? maxTs - months * 31 * 24 * 60 * 60 * 1000 : null;
    const minCents = minAmount ? Math.round(parseFloat(minAmount) * 100) : 0;
    const q = query.trim().toLowerCase();
    return data.items.filter((i) => {
      if (q && !i.description.toLowerCase().includes(q)) return false;
      if (cutoff != null && i.ts < cutoff) return false;
      if (minCents && Math.abs(i.signedCents) < minCents) return false;
      return true;
    });
  }, [data.items, query, range, minAmount, maxTs]);

  const chartData = data.points.map((p) => p.cents);
  const hasChart = data.variant !== "fill" && chartData.length >= 2;
  const minLabel = hasChart ? formatMoneyCompact(Math.min(...chartData)) : "";
  const maxLabel = hasChart ? formatMoneyCompact(Math.max(...chartData)) : "";

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      placement="center"
      maxWidth="max-w-lg"
      eyebrow="Trend"
      title={data.label}
      description="Month-to-month history from posted financial activity"
    >
      <div className="px-6 py-5 space-y-5">
        {/* Current value */}
        <div>
          <p className="font-display text-3xl text-text tabular-nums">
            {data.currentValue}
          </p>
          <p className="text-[11px] text-text-subtle uppercase tracking-wider">
            Current {data.label.toLowerCase()}
          </p>
        </div>

        {/* Deductible-style fill bar */}
        {data.variant === "fill" && data.fill && (
          <div>
            <div className="flex items-center justify-between text-xs text-text-subtle mb-1.5">
              <span>{data.fill.metLabel} applied</span>
              <span>{data.fill.pct}% of {data.fill.totalLabel}</span>
            </div>
            <div className="h-3 bg-surface-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent to-accent-strong rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, data.fill.pct))}%` }}
              />
            </div>
            <p className="text-xs text-text-muted mt-2">
              {data.fill.remainingLabel} remaining this plan year.
            </p>
          </div>
        )}

        {/* Cumulative chart */}
        {hasChart && (
          <div>
            <Sparkline data={chartData} width={452} height={96} className="w-full" />
            <div className="flex items-center justify-between text-[10px] text-text-subtle tabular-nums mt-1">
              <span>{data.points[0]?.label}</span>
              <span className="text-text-muted">
                {minLabel} – {maxLabel}
              </span>
              <span>{data.points.at(-1)?.label}</span>
            </div>
          </div>
        )}
        {data.variant !== "fill" && !hasChart && (
          <p className="text-sm text-text-muted">
            Not enough posted activity to chart a trend yet.
          </p>
        )}

        {data.note && (
          <p className="text-[11px] text-text-subtle leading-relaxed border-t border-border pt-3">
            {data.note}
          </p>
        )}

        {/* Filters */}
        {data.items.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search activity…"
                className="flex-1 min-w-[140px] h-8 px-3 rounded-lg border border-border bg-surface text-sm text-text placeholder:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
              <input
                type="number"
                inputMode="decimal"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="Min $"
                className="w-20 h-8 px-3 rounded-lg border border-border bg-surface text-sm text-text placeholder:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 tabular-nums"
              />
            </div>
            <div className="flex items-center gap-1">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    range === r.key
                      ? "bg-accent/10 text-accent border-accent/20"
                      : "bg-surface-muted text-text-muted border-border hover:text-text"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Activity list */}
            <ul className="divide-y divide-border/50 max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="py-4 text-sm text-text-muted text-center">
                  No activity matches these filters.
                </li>
              ) : (
                filtered.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-text truncate">
                        {i.description}
                      </p>
                      <p className="text-[11px] text-text-subtle tabular-nums">
                        {i.dateLabel}
                      </p>
                    </div>
                    <span
                      className={`text-sm tabular-nums font-medium shrink-0 ${
                        i.signedCents < 0 ? "text-success" : "text-text"
                      }`}
                    >
                      {i.amountLabel}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </div>
    </ModalShell>
  );
}
