// Pure, framework-free helpers for <MetricBox>. Kept in their own module so
// they can be unit-tested without a DOM / React renderer. The component
// (MetricBox.tsx) is the only intended consumer, but everything here is
// side-effect-free and safe to import anywhere.

export const METRIC_CHART_TYPES = ["line", "area", "bar"] as const;
export type MetricChartType = (typeof METRIC_CHART_TYPES)[number];

/**
 * Cycle line → area → bar → line. Drives the popup's "feather" button (G10:
 * "feather icon re-beautifies / cycles chart types"). An unknown current
 * value resolves to the first type so the button can never get stuck.
 */
export function cycleChartType(current: MetricChartType): MetricChartType {
  const i = METRIC_CHART_TYPES.indexOf(current);
  // indexOf returns -1 for an unknown value; (-1 + 1) % len === 0 → "line".
  return METRIC_CHART_TYPES[(i + 1) % METRIC_CHART_TYPES.length];
}

export type MetricDirection = "up" | "down" | "flat";

export interface SeriesSummary {
  count: number;
  min: number;
  max: number;
  avg: number;
  first: number;
  last: number;
  /** last − first */
  delta: number;
  /** percent change first → last; null when first === 0 (no baseline). */
  deltaPct: number | null;
  direction: MetricDirection;
}

/**
 * Summary stats for a numeric series, shown above the drill-in chart. Returns
 * null for an empty series so callers can render an empty state instead of
 * NaN-filled cells.
 */
export function summarizeSeries(values: number[]): SeriesSummary | null {
  if (!values || values.length === 0) return null;
  let min = values[0];
  let max = values[0];
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  // Use |first| so a recovery from a negative baseline reads as a positive %.
  const deltaPct = first === 0 ? null : (delta / Math.abs(first)) * 100;
  const direction: MetricDirection =
    delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return {
    count: values.length,
    min,
    max,
    avg: sum / values.length,
    first,
    last,
    delta,
    deltaPct,
    direction,
  };
}

export type MetricValueFormat =
  | "money" // value is whole dollars → "$1,234"
  | "moneyCents" // value is cents → "$1,234"
  | "percent" // value is a percentage → "12.3%"
  | "number" // plain integer-ish → "1,234"
  | "compact"; // large counts → "1.2k"

function usd(maximumFractionDigits = 0): Intl.NumberFormat {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  });
}

/**
 * Format a single y-value for the tooltip / summary stats. String inputs that
 * aren't finite numbers pass through untouched (recharts occasionally hands a
 * pre-formatted label). Kept pure (no locale surprises beyond Intl) so it's
 * testable and identical on server and client.
 */
export function formatMetricValue(
  value: number | string,
  format: MetricValueFormat,
): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  switch (format) {
    case "money":
      return usd(0).format(n);
    case "moneyCents":
      return usd(0).format(n / 100);
    case "percent":
      return `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
    case "compact":
      return new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n);
    case "number":
    default:
      return n.toLocaleString("en-US");
  }
}
