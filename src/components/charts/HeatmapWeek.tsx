"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";

export interface HeatmapWeekDatum {
  /** ISO date (yyyy-mm-dd) or Date — used for tooltip + alignment. */
  date: string | Date;
  /** Activity count for this day. Must be >= 0. */
  value: number;
}

export interface HeatmapWeekProps {
  values: HeatmapWeekDatum[];
  /** Number of trailing weeks to render. Default 16. */
  weeks?: number;
  /** Side of each cell in px. Default 12. */
  cellSize?: number;
  /** Override the high-activity color. Default brand accent. */
  color?: string;
  /** Override the zero-activity color. Default low-contrast surface. */
  emptyColor?: string;
  /** Show a loading skeleton. */
  loading?: boolean;
  /** Optional custom empty-state messaging. */
  emptyTitle?: string;
  emptyDescription?: string;
  /** Show the M/W/F row labels on the left. Default true. */
  showDayLabels?: boolean;
  className?: string;
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * `<HeatmapWeek>` — GitHub-style activity calendar.
 *
 * - 7 rows (Sun..Sat) × N weeks (default 16) of rounded cells.
 * - 5-stop intensity ramp from `emptyColor` to brand `color`, computed against
 *   the max value in the supplied window.
 * - Hover tooltip shows the date + activity count via native `title` (no JS
 *   tooltip surface, so it stays SSR-safe + cheap).
 * - Skeleton + EmptyState parity with the recharts wrappers; reduced-motion is
 *   inherent (no animation).
 */
export function HeatmapWeek({
  values,
  weeks = 16,
  cellSize = 12,
  color = "var(--accent)",
  emptyColor = "var(--surface-muted)",
  loading,
  emptyTitle = "No activity yet",
  emptyDescription = "Daily activity will fill in here as it accrues.",
  showDayLabels = true,
  className,
}: HeatmapWeekProps) {
  if (loading) {
    return (
      <Skeleton
        className={className}
        style={{ height: cellSize * 7 + 12, width: "100%" }}
      />
    );
  }
  if (!values || values.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        className={className}
      />
    );
  }

  // Build a lookup by ISO date and find the window end (most recent day).
  const byDate = new Map<string, number>();
  let maxValue = 0;
  for (const d of values) {
    const iso = toISODate(parseDate(d.date));
    const prev = byDate.get(iso) ?? 0;
    const next = prev + d.value;
    byDate.set(iso, next);
    if (next > maxValue) maxValue = next;
  }

  // End on today (UTC midnight) for stability across timezones.
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  // Walk back so the last column ends on the latest day; align rows by weekday.
  const endDayOfWeek = end.getUTCDay(); // 0..6 (Sun..Sat)
  const totalCells = weeks * 7;
  const startOffset = totalCells - 1 - endDayOfWeek; // first cell offset from end
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - startOffset);

  const cells: Array<{ iso: string; value: number; day: Date }> = [];
  for (let i = 0; i < totalCells; i++) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    const iso = toISODate(day);
    cells.push({ iso, day, value: byDate.get(iso) ?? 0 });
  }

  // Re-shape into columns (weeks) × rows (days).
  const columns: typeof cells[] = [];
  for (let w = 0; w < weeks; w++) {
    columns.push(cells.slice(w * 7, w * 7 + 7));
  }

  const stops = 5;
  const intensity = (v: number) => {
    if (v <= 0 || maxValue <= 0) return 0;
    return Math.min(stops, Math.ceil((v / maxValue) * stops));
  };
  const cellColor = (v: number) => {
    const lvl = intensity(v);
    if (lvl === 0) return emptyColor;
    // Mix accent at increasing opacity for a clean 5-stop ramp.
    const alpha = 0.2 + (lvl - 1) * 0.2; // .2, .4, .6, .8, 1.0
    return `color-mix(in srgb, ${color} ${alpha * 100}%, ${emptyColor})`;
  };

  return (
    <div
      role="img"
      aria-label={`Activity heatmap, last ${weeks} weeks`}
      className={cn("inline-flex items-start gap-1.5", className)}
    >
      {showDayLabels && (
        <div
          className="flex flex-col gap-[2px] text-[10px] text-text-subtle tabular-nums"
          aria-hidden="true"
          style={{ paddingTop: 0 }}
        >
          {DAY_LABELS.map((d, i) => (
            <div
              key={i}
              style={{
                height: cellSize,
                lineHeight: `${cellSize}px`,
                visibility: i % 2 === 1 ? "visible" : "hidden",
              }}
            >
              {d}
            </div>
          ))}
        </div>
      )}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${weeks}, ${cellSize}px)`,
          gap: 2,
        }}
      >
        {columns.map((col, ci) => (
          <div
            key={ci}
            className="flex flex-col"
            style={{ gap: 2 }}
          >
            {col.map((c) => (
              <div
                key={c.iso}
                title={`${c.iso} · ${c.value.toLocaleString()} ${c.value === 1 ? "entry" : "entries"}`}
                aria-label={`${c.iso}: ${c.value}`}
                className="rounded-[3px] border border-border/40"
                style={{
                  width: cellSize,
                  height: cellSize,
                  background: cellColor(c.value),
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
