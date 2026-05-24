"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// MiniSparkline — a tiny inline SVG line, sized for KPI tile use (~60×16 px).
// Designed to sit next to a headline number, not as a stand-alone chart.
//
// We already have a larger area-fill `Sparkline` (src/components/ui/sparkline.tsx)
// for analytics panels; this is the inline-with-text micro-variant. Pure SVG,
// no chart library, direction-aware color via theme tokens.
//
// Naming intentionally different (`values`, not `data`) so callers can grep
// for tile usage independently of the larger panel chart.
// ---------------------------------------------------------------------------

export interface MiniSparklineProps {
  values: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  /** "auto" picks accent / danger / muted based on first→last delta */
  stroke?: "auto" | string;
  ariaLabel?: string;
  className?: string;
}

export function MiniSparkline({
  values,
  width = 60,
  height = 16,
  strokeWidth = 1.5,
  stroke = "auto",
  ariaLabel,
  className,
}: MiniSparklineProps) {
  if (!values || values.length < 2) {
    return (
      <span
        className={cn("inline-block", className)}
        style={{ width, height }}
        aria-hidden="true"
      />
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const pad = strokeWidth;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const stepX = w / (values.length - 1);

  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + h - ((v - min) / range) * h;
    return [x, y] as const;
  });

  const pathD = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");

  // Direction-aware default color.
  let strokeColor = stroke;
  if (stroke === "auto") {
    const first = values[0];
    const last = values[values.length - 1];
    if (last > first) strokeColor = "var(--accent)";
    else if (last < first) strokeColor = "var(--danger)";
    else strokeColor = "var(--text-muted)";
  }

  const label =
    ariaLabel ??
    `Trend over ${values.length} points, latest ${values[values.length - 1].toLocaleString()}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("inline-block align-middle", className)}
      role="img"
      aria-label={label}
    >
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r={Math.max(1, strokeWidth)}
        fill={strokeColor}
      />
    </svg>
  );
}
