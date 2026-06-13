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

// --- G9 compare-mode -------------------------------------------------------

export interface CompareSeriesInput {
  /** Stable key used as the merged-row dataKey + recharts line id. */
  id: string;
  /** Human label for the line (tooltip / legend). */
  label: string;
  /** This series' points. */
  points: { label: string; value: number }[];
  /** Optional explicit line color. */
  color?: string;
}

export interface CompareLine {
  dataKey: string;
  label: string;
  color?: string;
}

export interface CompareDataset {
  /** One row per distinct x-label, with a column per series id. */
  data: Array<Record<string, number | string | null>>;
  /** Line definitions to feed <TrendLine lines=...>. */
  lines: CompareLine[];
  /** True when the selected series share no x-labels (overlay won't align). */
  disjoint: boolean;
}

/**
 * Merge N selected metric series into a single dataset for the compare overlay
 * (G9: "select ≥2 → overlay the measures on one chart"). Rows are keyed by
 * x-label in first-seen order across all series; a series missing a given
 * label yields null there (recharts simply gaps the line). `disjoint` flags the
 * degenerate case where the chosen series share no labels, so the UI can warn
 * instead of drawing parallel non-overlapping lines.
 */
export function mergeSeriesByLabel(series: CompareSeriesInput[]): CompareDataset {
  const order: string[] = [];
  const rows = new Map<string, Record<string, number | string | null>>();
  for (const s of series) {
    for (const p of s.points) {
      let row = rows.get(p.label);
      if (!row) {
        row = { label: p.label };
        rows.set(p.label, row);
        order.push(p.label);
      }
      row[s.id] = p.value;
    }
  }
  const data = order.map((label) => {
    const row = rows.get(label)!;
    // Fill missing series columns with null so every row has every key.
    for (const s of series) {
      if (!(s.id in row)) row[s.id] = null;
    }
    return row;
  });
  const lines: CompareLine[] = series.map((s) => ({
    dataKey: s.id,
    label: s.label,
    color: s.color,
  }));
  // Disjoint = no label is shared by ≥2 series (every row has <2 non-null
  // values). Only meaningful with ≥2 series.
  const disjoint =
    series.length >= 2 &&
    data.every((row) => {
      let present = 0;
      for (const s of series) if (row[s.id] != null) present++;
      return present < 2;
    });
  return { data, lines, disjoint };
}
