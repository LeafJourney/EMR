"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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

export interface TrendAreaSeries {
  dataKey: string;
  label?: string;
  color?: string;
}

export interface TrendAreaProps<T extends object> {
  data: T[];
  lines: TrendAreaSeries[];
  xKey?: keyof T & string;
  yLabel?: string;
  xLabel?: string;
  unit?: string;
  height?: number;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Stack the areas (e.g. for cohort composition). */
  stacked?: boolean;
  className?: string;
}

/**
 * `<TrendArea>` — branded recharts AreaChart wrapper.
 *
 * Same visual contract as `<TrendLine>` (hairline grid, no axis lines,
 * tabular-nums ticks, Card-tier tooltip, EmptyState + Skeleton), but each
 * series renders as a soft gradient area on top of its stroke line. Useful
 * for cumulative / volume trends where the "amount under the curve" matters.
 */
export function TrendArea<T extends object>({
  data,
  lines,
  xKey = "label" as keyof T & string,
  yLabel,
  xLabel,
  unit,
  height = 240,
  loading,
  stacked,
  emptyTitle = "No data yet",
  emptyDescription = "Once data starts flowing, the trend will appear here.",
  className,
}: TrendAreaProps<T>) {
  const prefersReduced = useReducedMotion();
  const gradientPrefix = React.useId();
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
        <AreaChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: xLabel ? 4 : 0 }}
        >
          <defs>
            {lines.map((s, i) => {
              const color = s.color ?? chartColor(i);
              const id = `${gradientPrefix}-area-${i}`;
              return (
                <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey={xKey as string}
            {...X_AXIS_DEFAULTS}
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
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            content={<ChartTooltip unit={unit} />}
          />
          {lines.map((s, i) => {
            const color = s.color ?? chartColor(i);
            return (
              <Area
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.label ?? s.dataKey}
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientPrefix}-area-${i})`}
                stackId={stacked ? "stack" : undefined}
                activeDot={{ r: 4, strokeWidth: 0, fill: color }}
                isAnimationActive={!prefersReduced}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
