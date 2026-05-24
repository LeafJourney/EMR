/**
 * Branded chart primitives — Linear/Stripe-tier recharts wrappers.
 *
 * Use these instead of importing from `recharts` directly. They share a single
 * theme (brand palette, hairline grid, no axis lines, tabular-nums ticks,
 * Card-tier tooltip) and consistent empty + loading states.
 *
 * - `<TrendLine>`        — line chart for time-series trends.
 * - `<TrendArea>`        — soft-gradient area variant of TrendLine.
 * - `<DistributionBar>`  — vertical bars for histograms / bucketed counts.
 * - `<ProgressDonut>`    — donut showing a completed/total ratio.
 * - `<HeatmapWeek>`      — GitHub-style daily activity calendar.
 */
export { TrendLine } from "./TrendLine";
export type { TrendLineProps, TrendLineSeries } from "./TrendLine";
export { TrendArea } from "./TrendArea";
export type { TrendAreaProps, TrendAreaSeries } from "./TrendArea";
export { DistributionBar } from "./DistributionBar";
export type { DistributionBarProps, DistributionBarDatum } from "./DistributionBar";
export { ProgressDonut } from "./ProgressDonut";
export type { ProgressDonutProps } from "./ProgressDonut";
export { HeatmapWeek } from "./HeatmapWeek";
export type { HeatmapWeekProps, HeatmapWeekDatum } from "./HeatmapWeek";
export { ChartTooltip } from "./ChartTooltip";
export type { ChartTooltipProps, ChartTooltipDatum } from "./ChartTooltip";
export {
  CHART_PALETTE,
  chartColor,
  AXIS_TICK,
  GRID_PROPS,
  X_AXIS_DEFAULTS,
  Y_AXIS_DEFAULTS,
} from "./theme";
