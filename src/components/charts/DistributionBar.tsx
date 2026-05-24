"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ChartTooltip } from "./ChartTooltip";
import { useReducedMotion } from "./useReducedMotion";
import {
  GRID_PROPS,
  X_AXIS_DEFAULTS,
  Y_AXIS_DEFAULTS,
  chartColor,
} from "./theme";

export interface DistributionBarDatum {
  /** Bucket label (x-axis). */
  label: string;
  /** Bucket value (y-axis). */
  value: number;
  /** Optional per-bar color override. Falls back to the brand accent. */
  color?: string;
}

export interface DistributionBarProps {
  data: DistributionBarDatum[];
  yLabel?: string;
  xLabel?: string;
  unit?: string;
  height?: number;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Cycle bar colors through the palette instead of using a single accent. */
  rainbow?: boolean;
  className?: string;
}

/**
 * `<DistributionBar>` — branded recharts vertical BarChart wrapper.
 *
 * - Single-series bucket distribution (e.g. age cohorts, score histogram).
 * - All bars in brand accent by default; pass `rainbow` to cycle the palette,
 *   or supply per-datum `color` overrides for categorical highlights.
 * - Hairline grid only; rounded top corners; Card-tier tooltip; EmptyState +
 *   Skeleton parity with the other chart primitives.
 */
export function DistributionBar({
  data,
  yLabel,
  xLabel,
  unit,
  height = 240,
  loading,
  rainbow,
  emptyTitle = "No data yet",
  emptyDescription = "Once data starts flowing, the distribution will appear here.",
  className,
}: DistributionBarProps) {
  const prefersReduced = useReducedMotion();
  if (loading) {
    return (
      <Skeleton
        className={className}
        style={{ height, width: "100%" }}
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        className={className}
      />
    );
  }
  return (
    <div className={className} style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: xLabel ? 4 : 0 }}
        >
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="label"
            {...X_AXIS_DEFAULTS}
            interval={0}
            label={
              xLabel
                ? {
                    value: xLabel,
                    position: "insideBottom",
                    offset: -2,
                    fill: "var(--text-subtle)",
                    fontSize: 11,
                  }
                : undefined
            }
          />
          <YAxis
            {...Y_AXIS_DEFAULTS}
            tickFormatter={(v: number) =>
              unit ? `${v}${unit}` : v.toLocaleString()
            }
            label={
              yLabel
                ? {
                    value: yLabel,
                    angle: -90,
                    position: "insideLeft",
                    fill: "var(--text-subtle)",
                    fontSize: 11,
                  }
                : undefined
            }
          />
          <Tooltip
            cursor={{ fill: "var(--surface-muted)", opacity: 0.5 }}
            content={<ChartTooltip unit={unit} />}
          />
          <Bar
            dataKey="value"
            radius={[6, 6, 0, 0]}
            isAnimationActive={!prefersReduced}
          >
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.color ?? (rainbow ? chartColor(i) : "var(--accent)")}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
