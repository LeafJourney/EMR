"use client";

import * as React from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useReducedMotion } from "./useReducedMotion";

export interface ProgressDonutProps {
  /** Completed value (numerator). */
  value: number;
  /** Total value (denominator). Must be > 0 or the donut renders empty. */
  max: number;
  /** Size in pixels. Donut is square. Default 160. */
  size?: number;
  /** Stroke thickness as a fraction of the radius. Default 0.22. */
  thickness?: number;
  /** Override the filled-arc color. Default brand accent. */
  color?: string;
  /** Override the empty-track color. Default low-contrast border. */
  trackColor?: string;
  /** Override the big number rendered inside the donut. */
  label?: React.ReactNode;
  /** Optional sublabel under the big number (e.g. "of 24 tasks"). */
  sublabel?: React.ReactNode;
  /** Show a loading skeleton. */
  loading?: boolean;
  className?: string;
}

/**
 * `<ProgressDonut>` — branded recharts PieChart donut for completed/total ratios.
 *
 * - Brand-accent filled arc on a low-contrast track ring.
 * - Centered numeric readout (tabular-nums) + optional sublabel.
 * - Reduced-motion aware: arc animation is disabled when the user opts out.
 * - Skeleton parity with the rest of the chart wrappers.
 *
 * Designed for surfaces like "tasks completed", "intake fields filled",
 * "verifications closed" — anywhere you'd reach for a progress ring.
 */
export function ProgressDonut({
  value,
  max,
  size = 160,
  thickness = 0.22,
  color = "var(--accent)",
  trackColor = "var(--border)",
  label,
  sublabel,
  loading,
  className,
}: ProgressDonutProps) {
  const prefersReduced = useReducedMotion();
  if (loading) {
    return (
      <Skeleton
        className={className}
        style={{ width: size, height: size, borderRadius: "9999px" }}
      />
    );
  }
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.max(0, Math.min(value, safeMax));
  const pct = (clamped / safeMax) * 100;
  const data = [
    { name: "value", value: clamped, fill: color },
    { name: "rest", value: Math.max(safeMax - clamped, 0), fill: trackColor },
  ];
  const outerRadius = size / 2;
  const innerRadius = outerRadius * (1 - thickness);
  return (
    <div
      role="img"
      aria-label={`${pct.toFixed(0)}% complete (${clamped} of ${max})`}
      className={className}
      style={{ width: size, height: size, position: "relative" }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={0}
            stroke="none"
            isAnimationActive={!prefersReduced}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
      >
        <div className="text-2xl font-semibold tabular-nums text-text">
          {label ?? `${Math.round(pct)}%`}
        </div>
        {sublabel && (
          <div className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-text-subtle">
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}
