"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Shared chart tooltip — matches the Card primitive aesthetic.
 *
 * - rounded-xl, hairline border, sm shadow on the parchment surface
 * - 11px uppercase eyebrow for the label
 * - tabular-nums numeric values
 * - colored swatches keyed to the series stroke/fill
 *
 * Used as the `content` prop for recharts `<Tooltip />` across all branded
 * chart wrappers in `src/components/charts/`.
 */

export interface ChartTooltipDatum {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipDatum[];
  label?: React.ReactNode;
  /** Optional formatter for numeric values. */
  formatValue?: (value: number | string, name?: string) => React.ReactNode;
  /** Optional formatter for the label (x-axis value). */
  formatLabel?: (label: React.ReactNode) => React.ReactNode;
  /** Optional unit suffix appended to every value (e.g. "%"). */
  unit?: string;
  className?: string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  formatLabel,
  unit,
  className,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      role="tooltip"
      className={cn(
        "rounded-xl border border-border bg-surface px-3 py-2 shadow-sm",
        "text-sm text-text",
        className,
      )}
    >
      {label !== undefined && label !== null && label !== "" && (
        <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle">
          {formatLabel ? formatLabel(label) : label}
        </p>
      )}
      <ul className="space-y-1">
        {payload.map((d, i) => {
          const v = d.value ?? "";
          const formatted = formatValue
            ? formatValue(v, d.name)
            : `${typeof v === "number" ? v.toLocaleString() : v}${unit ?? ""}`;
          return (
            <li key={i} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: d.color ?? "var(--accent)" }}
              />
              {d.name && (
                <span className="text-text-muted">{d.name}</span>
              )}
              <span className="ml-auto font-medium tabular-nums">
                {formatted}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
