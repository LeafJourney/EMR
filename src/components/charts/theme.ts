/**
 * Shared chart theme — Linear/Stripe-tier branded recharts wrappers.
 *
 * - Pulls from the EMR design tokens (var(--accent), var(--text-muted), etc.)
 *   so charts stay in sync with the global theme (light/dark/parchment).
 * - Hairline grid (1px dashed, low-contrast), no axis line by default,
 *   tabular-nums ticks, minimal clutter.
 * - Tooltips match the Card primitive (rounded-xl, hairline border, sm
 *   shadow, parchment surface).
 */

// Brand palette — accent-led, warm cohort. Used in cycling order so the first
// series always lands on the brand accent.
export const CHART_PALETTE = [
  "var(--accent)",
  "#D4A24E", // warm honey
  "#5B8DB8", // sky
  "#7A6CB1", // mauve
  "#C47452", // clay
  "#4EA76A", // leaf
  "#9EC9A6", // sage
  "#6E6A60", // taupe
] as const;

/** Stable color for a series index — wraps the palette. */
export function chartColor(i: number): string {
  return CHART_PALETTE[i % CHART_PALETTE.length];
}

/** Shared axis tick style — tabular-nums, muted, 11px. */
export const AXIS_TICK = {
  fill: "var(--text-muted)",
  fontSize: 11,
  fontVariantNumeric: "tabular-nums" as const,
} as const;

/** Shared cartesian grid props — hairline, dashed, vertical=off. */
export const GRID_PROPS = {
  strokeDasharray: "2 4" as const,
  stroke: "var(--border)" as const,
  vertical: false as const,
  opacity: 0.7,
} as const;

/** Shared XAxis defaults — no line, no tick line, dy padding. */
export const X_AXIS_DEFAULTS = {
  tickLine: false as const,
  axisLine: false as const,
  tick: AXIS_TICK,
  dy: 8,
} as const;

/** Shared YAxis defaults — no line, no tick line, narrow margin. */
export const Y_AXIS_DEFAULTS = {
  tickLine: false as const,
  axisLine: false as const,
  tick: AXIS_TICK,
  width: 32,
} as const;
