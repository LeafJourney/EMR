"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Popover } from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// LeafNerd analytics (EMR-946)
//
// A small "feather" icon button that lives next to the "Aging buckets" title.
// Clicking it opens a popup that presents the aging data in a clean, graphical
// way (inline SVG donut + styled bars), branded as the "LeafNerd analytics"
// engine. A secondary filter button lets the viewer slice the view by what is
// emphasised — total dollars, days (age weighting) or a minimum-dollar floor.
//
// Self-contained client island: it receives already-serialized bucket totals
// from the server page (no Date objects, plain numbers) and renders locally.
// All colours are inline Tailwind arbitrary values to stay within the
// "edit only files under ops/aging" constraint.
// ---------------------------------------------------------------------------

export type LeafNerdBucket = {
  key: string;
  label: string;
  /** dot/bar colour (already resolved to a CSS value) */
  color: string;
  total: number;
  insurance: number;
  patient: number;
};

type ViewMode = "dollars" | "days" | "floor";

const VIEW_OPTIONS: { value: ViewMode; label: string; hint: string }[] = [
  { value: "dollars", label: "By dollars", hint: "Balance per age range" },
  { value: "days", label: "By age (oldest first)", hint: "Emphasise old A/R" },
  { value: "floor", label: "Only large balances", hint: "Hide small balances" },
];

const FLOOR_CENTS = 50_000; // $500 minimum when the "floor" view is active.

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// Feather glyph — a simple, friendly mark for the analytics engine.
function FeatherIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
      <line x1="16" y1="8" x2="2" y2="22" />
      <line x1="17.5" y1="15" x2="9" y2="15" />
    </svg>
  );
}

export function LeafNerdAnalytics({ buckets }: { buckets: LeafNerdBucket[] }) {
  return (
    <Popover
      side="bottom"
      className="!p-0 !rounded-2xl !border-[#e6dcc4] w-[min(92vw,460px)]"
      content={<AnalyticsPanel buckets={buckets} />}
    >
      <button
        type="button"
        aria-label="Open LeafNerd analytics"
        title="LeafNerd analytics"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#e6dcc4] bg-[#f5f0e1] text-[#8a6d3b] transition-all hover:scale-105 hover:bg-[#efe6cf] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#cdb98a]"
      >
        <FeatherIcon className="h-4 w-4" />
      </button>
    </Popover>
  );
}

function AnalyticsPanel({ buckets }: { buckets: LeafNerdBucket[] }) {
  const [view, setView] = useState<ViewMode>("dollars");

  const data = useMemo(() => {
    let rows = buckets.map((b) => ({ ...b }));
    if (view === "floor") {
      rows = rows.filter((b) => b.total >= FLOOR_CENTS);
    }
    if (view === "days") {
      // buckets arrive oldest-last; flip so the oldest range leads.
      rows = [...rows].reverse();
    }
    const grandTotal = rows.reduce((a, b) => a + b.total, 0);
    return { rows, grandTotal };
  }, [buckets, view]);

  const insuranceTotal = data.rows.reduce((a, b) => a + b.insurance, 0);
  const patientTotal = data.rows.reduce((a, b) => a + b.patient, 0);

  return (
    <div className="rounded-2xl bg-[#fbf8f0] p-4">
      {/* Header / brand */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#e8f3e1] text-[#3f7d34]">
              <FeatherIcon className="h-3 w-3" />
            </span>
            <span className="font-display text-sm text-[#2f3a2c]">
              LeafNerd analytics
            </span>
          </div>
          <p className="text-[11px] text-[#8a8270] mt-0.5">
            Aging A/R, visualised
          </p>
        </div>

        {/* Filter button — slice the view by dollars / time / floor. */}
        <Popover
          side="bottom"
          content={
            <div className="flex flex-col gap-0.5 min-w-[12rem]">
              {VIEW_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setView(opt.value)}
                  className={cn(
                    "flex flex-col items-start rounded-md px-2.5 py-1.5 text-left transition-colors",
                    view === opt.value
                      ? "bg-[#f5f0e1] text-[#2f3a2c]"
                      : "text-text-muted hover:bg-surface-muted hover:text-text",
                  )}
                >
                  <span className="text-xs font-medium">{opt.label}</span>
                  <span className="text-[10px] opacity-70">{opt.hint}</span>
                </button>
              ))}
            </div>
          }
        >
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-[#e6dcc4] bg-[#f5f0e1] px-2.5 py-1 text-[11px] font-medium text-[#8a6d3b] transition-colors hover:bg-[#efe6cf]"
          >
            <FilterGlyph />
            {VIEW_OPTIONS.find((o) => o.value === view)?.label ?? "Filter"}
            <span aria-hidden className="text-[9px] opacity-70">
              ▾
            </span>
          </button>
        </Popover>
      </div>

      {/* Donut + split summary */}
      <div className="flex items-center gap-4 rounded-xl bg-white/70 border border-[#efe6cf] p-3 mb-3">
        <Donut buckets={data.rows} total={data.grandTotal} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-[#8a8270]">
            Total in view
          </p>
          <p className="font-display text-xl text-[#2f3a2c] tabular-nums">
            {money(data.grandTotal)}
          </p>
          <div className="mt-2 flex flex-col gap-1">
            <SplitRow
              label="Insurance"
              value={insuranceTotal}
              total={data.grandTotal}
              color="#f6c64b"
            />
            <SplitRow
              label="Patient"
              value={patientTotal}
              total={data.grandTotal}
              color="#c4b5f0"
            />
          </div>
        </div>
      </div>

      {/* Styled bars per bucket */}
      <div className="space-y-2.5">
        {data.rows.length === 0 ? (
          <p className="text-[11px] text-[#8a8270] py-4 text-center">
            No balances match this view.
          </p>
        ) : (
          data.rows.map((b) => {
            const pct =
              data.grandTotal > 0 ? (b.total / data.grandTotal) * 100 : 0;
            return (
              <div key={b.key}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: b.color }}
                    />
                    <span className="text-[11px] font-medium text-[#3a4236]">
                      {b.label}
                    </span>
                  </div>
                  <span className="text-[11px] tabular-nums text-[#2f3a2c]">
                    {money(b.total)}
                    <span className="text-[#a39b86]"> · {pct.toFixed(0)}%</span>
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[#efe6cf] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(pct, b.total > 0 ? 3 : 0)}%`,
                      backgroundColor: b.color,
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SplitRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2 w-2 rounded-sm shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] text-[#5b6152] w-16 shrink-0">{label}</span>
      <span className="text-[11px] tabular-nums text-[#2f3a2c]">
        {money(value)}
      </span>
      <span className="text-[10px] text-[#a39b86] ml-auto tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

// Inline SVG donut — proportions of total balance by bucket.
function Donut({
  buckets,
  total,
}: {
  buckets: LeafNerdBucket[];
  total: number;
}) {
  const size = 72;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  let offsetAcc = 0;
  const segments =
    total > 0
      ? buckets
          .filter((b) => b.total > 0)
          .map((b) => {
            const frac = b.total / total;
            const seg = {
              key: b.key,
              color: b.color,
              dash: frac * circumference,
              offset: offsetAcc * circumference,
            };
            offsetAcc += frac;
            return seg;
          })
      : [];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      role="img"
      aria-label="Balance distribution by age range"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#efe6cf"
        strokeWidth={stroke}
      />
      {segments.map((s) => (
        <circle
          key={s.key}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={s.color}
          strokeWidth={stroke}
          strokeDasharray={`${s.dash} ${circumference - s.dash}`}
          strokeDashoffset={-s.offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeLinecap="butt"
        />
      ))}
    </svg>
  );
}

function FilterGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}
