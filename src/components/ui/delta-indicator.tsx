"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Tooltip } from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// DeltaIndicator — small inline up/down arrow + percent change badge.
//
// • Green for "good" direction, red for "bad", muted gray for flat
// • Subtle scale-in animation on first render (skipped under
//   prefers-reduced-motion)
// • Tooltip (native title attr) shows the absolute change
//
// `goodWhen` lets callers configure semantics: revenue ↑ is good, denials
// ↑ is bad. Defaults to "up" (most common — bigger is better).
// ---------------------------------------------------------------------------

export interface DeltaIndicatorProps {
  /** Current value */
  current: number;
  /** Previous-period value for comparison */
  previous: number;
  /** Which direction is considered favourable */
  goodWhen?: "up" | "down" | "either";
  /** Format helper for the *absolute* change shown in the tooltip */
  format?: (n: number) => string;
  /** Override the percent formatter (defaults to one decimal) */
  formatPercent?: (pct: number) => string;
  /** Show "new" when previous === 0 (default true) */
  showNew?: boolean;
  className?: string;
}

function defaultPercent(pct: number): string {
  return `${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`;
}

export function DeltaIndicator({
  current,
  previous,
  goodWhen = "up",
  format,
  formatPercent = defaultPercent,
  showNew = true,
  className,
}: DeltaIndicatorProps) {
  const absChange = current - previous;

  let direction: "up" | "down" | "flat";
  if (absChange > 0) direction = "up";
  else if (absChange < 0) direction = "down";
  else direction = "flat";

  const isNew = previous === 0 && current !== 0;
  const percent =
    previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;

  // Semantic color: green when moving the "good" direction, red when bad,
  // muted when flat. Uses theme tokens to stay on-palette in light/dark.
  const isGood =
    goodWhen === "either"
      ? true
      : (goodWhen === "up" && direction === "up") ||
        (goodWhen === "down" && direction === "down");
  const colorClass =
    direction === "flat"
      ? "text-text-muted"
      : isGood
        ? "text-accent"
        : "text-[color:var(--danger)]";

  const arrow =
    direction === "up" ? "▲" : direction === "down" ? "▼" : "→";

  const label =
    isNew && showNew
      ? "new"
      : percent === null
        ? "—"
        : formatPercent(percent);

  const tooltip =
    previous === 0
      ? `New (prior period: 0)`
      : `${absChange > 0 ? "+" : ""}${format ? format(absChange) : absChange.toLocaleString()} vs prior`;

  return (
    <Tooltip content={tooltip}>
      <span
        tabIndex={0}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
          "animate-in fade-in zoom-in-95 duration-300 ease-out",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 rounded",
          colorClass,
          className,
        )}
        aria-label={`${direction === "up" ? "up" : direction === "down" ? "down" : "no change"} ${label}, ${tooltip}`}
      >
        <span aria-hidden="true" className="text-[0.7em] leading-none">
          {arrow}
        </span>
        <span>{label}</span>
      </span>
    </Tooltip>
  );
}
