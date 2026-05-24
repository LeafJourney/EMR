"use client";

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
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

export interface TrendLineSeries {
  /** Key in each row that holds this series' numeric value. */
  dataKey: string;
  /** Human label rendered in tooltip and legend. */
  label?: string;
  /** Override the auto-cycled palette color. */
  color?: string;
  /** Render this line as dashed (e.g. forecast / projection). */
  dashed?: boolean;
}

export interface TrendLineProps<T extends object> {
  data: T[];
  /** Series definitions. The first series is rendered in brand accent. */
  lines: TrendLineSeries[];
  /** Key in each row that holds the x-axis label (e.g. date / week). */
  xKey?: keyof T & string;
  yLabel?: string;
  xLabel?: string;
  /** Optional unit suffix shown in tooltip values (e.g. "%"). */
  unit?: string;
  /** Container height. Default 240. */
  height?: number;
  /** Show loading skeleton. */
  loading?: boolean;
  /** Custom empty-state title. */
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

/**
 * `<TrendLine>` — branded recharts LineChart wrapper.
 *
 * - First series renders in brand accent; additional series cycle the palette.
 * - Hairline horizontal grid only; no axis lines; no tick lines; tabular-nums.
 * - Tooltip uses the shared <ChartTooltip /> for Card-tier visuals.
 * - Empty state via <EmptyState />; loading via <Skeleton />.
 * - Animations disabled when the user prefers reduced motion.
 */
export function TrendLine<T extends object>({
  data,
  lines,
  xKey = "label" as keyof T & string,
  yLabel,
  xLabel,
  unit,
  height = 240,
  loading,
  emptyTitle = "No data yet",
  emptyDescription = "Once data starts flowing, the trend will appear here.",
  className,
}: TrendLineProps<T>) {
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
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: yLabel ? 4 : 0 }}
        >
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
            tickFormatter={(v: number) =>
              unit ? `${v}${unit}` : v.toLocaleString()
            }
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            content={<ChartTooltip unit={unit} />}
          />
          {lines.map((s, i) => {
            const color = s.color ?? chartColor(i);
            return (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.label ?? s.dataKey}
                stroke={color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "4 4" : undefined}
                dot={{ r: 0 }}
                activeDot={{ r: 4, strokeWidth: 0, fill: color }}
                isAnimationActive={!prefersReduced}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

