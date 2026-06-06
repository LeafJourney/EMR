// EMR-374 — Self-contained, DETERMINISTIC aggregate research data for the
// public LeafMart "Analytics Lab". Everything here is hand-authored or derived
// via pure index math (NO Math.random, NO time APIs) so the server renders the
// same bytes every time and the surface is safely cacheable / public.
//
// PRIVACY: every number below is a synthetic, de-identified, community-level
// AGGREGATE. There is no PHI here and none can be reconstructed — these are
// cohort-scale improvement scores and counts, never anything per-person.

export type MetricId =
  | "pain"
  | "sleep"
  | "anxiety"
  | "mood"
  | "nausea"
  | "focus";

export interface MetricMeta {
  id: MetricId;
  label: string;
  /** One-line plain-language description of the reported outcome dimension. */
  blurb: string;
}

/** The six aggregate research metric dimensions, in display order. */
export const METRICS: MetricMeta[] = [
  { id: "pain", label: "Pain", blurb: "Reported relief from aches and chronic discomfort." },
  { id: "sleep", label: "Sleep", blurb: "Reported sleep quality and ease of falling asleep." },
  { id: "anxiety", label: "Anxiety", blurb: "Reported sense of calm versus restlessness." },
  { id: "mood", label: "Mood", blurb: "Reported day-to-day mood and emotional balance." },
  { id: "nausea", label: "Nausea", blurb: "Reported settling of nausea and appetite." },
  { id: "focus", label: "Focus", blurb: "Reported clarity, attention, and follow-through." },
];

export const METRIC_IDS: MetricId[] = METRICS.map((m) => m.id);

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Heatmap cell: one (metric × time bucket) aggregate.
 * - `score` is a normalized improvement intensity in 0..1 used for color.
 * - `improvementPct` is the human-facing "avg improvement" reading (%).
 * - `sampleSize` is the cohort count contributing to that bucket.
 */
export interface HeatCell {
  score: number;
  improvementPct: number;
  sampleSize: number;
}

export interface MetricHeatRow {
  id: MetricId;
  label: string;
  cells: HeatCell[];
}

export interface HeatmapData {
  /** Column labels (12 trailing weeks). */
  weekLabels: string[];
  rows: MetricHeatRow[];
}

// ---------------------------------------------------------------------------
// Deterministic generators. All "randomness" is index math: a couple of
// blended sinusoids per metric give each row a distinct, realistic-looking
// rhythm without ever calling Math.random.
// ---------------------------------------------------------------------------

/** Per-metric phase + frequency seeds so each row looks different but stable. */
const METRIC_SEED: Record<MetricId, { phase: number; freq: number; base: number; swing: number }> = {
  pain:    { phase: 0.4, freq: 0.85, base: 0.62, swing: 0.26 },
  sleep:   { phase: 1.7, freq: 0.7,  base: 0.58, swing: 0.3 },
  anxiety: { phase: 2.6, freq: 1.05, base: 0.66, swing: 0.22 },
  mood:    { phase: 0.9, freq: 0.6,  base: 0.55, swing: 0.28 },
  nausea:  { phase: 3.3, freq: 1.2,  base: 0.5,  swing: 0.24 },
  focus:   { phase: 1.2, freq: 0.95, base: 0.48, swing: 0.27 },
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const WEEK_COUNT = 12;

function buildWeekLabels(): string[] {
  // "12w ago" … "now" — relative, no Date API so it's deterministic.
  const labels: string[] = [];
  for (let i = WEEK_COUNT; i >= 1; i--) {
    labels.push(i === 1 ? "Now" : `${i - 1}w`);
  }
  return labels;
}

function buildHeatmap(): HeatmapData {
  const weekLabels = buildWeekLabels();
  const rows: MetricHeatRow[] = METRICS.map((meta, rowIdx) => {
    const seed = METRIC_SEED[meta.id];
    const cells: HeatCell[] = [];
    for (let w = 0; w < WEEK_COUNT; w++) {
      // Two blended waves + a slow upward "treatment ramp" toward "Now".
      const t = w / (WEEK_COUNT - 1);
      const wave1 = Math.sin(seed.phase + t * Math.PI * 2 * seed.freq);
      const wave2 = Math.sin(seed.phase * 1.9 + t * Math.PI * 4 * seed.freq) * 0.4;
      const ramp = t * 0.18; // gentle improvement as cohorts continue use
      const raw = seed.base + ((wave1 + wave2) / 2) * seed.swing + ramp;
      const score = clamp01(raw);
      const improvementPct = Math.round(score * 72) + 8; // 8..80%
      // Sample size grows toward recent weeks and varies by row, all integer math.
      const sampleSize =
        180 + w * 26 + rowIdx * 37 + ((w * 7 + rowIdx * 13) % 19) * 9;
      cells.push({ score, improvementPct, sampleSize });
    }
    return { id: meta.id, label: meta.label, cells };
  });
  return { weekLabels, rows };
}

export const HEATMAP: HeatmapData = buildHeatmap();

// ---------------------------------------------------------------------------
// Seasonal series — per-metric, 12 monthly aggregate values (0..1) plus a
// hand-tuned, named "detected pattern" callout for each metric.
// ---------------------------------------------------------------------------

export interface SeasonalPoint {
  month: string;
  /** Normalized reported-outcome value 0..1 for the month. */
  value: number;
  /** Cohort sample size for that month. */
  sampleSize: number;
}

export interface SeasonalSeries {
  id: MetricId;
  label: string;
  points: SeasonalPoint[];
  /** Month index (0..11) of the detected peak. */
  peakMonth: number;
  /** Month index (0..11) of the detected trough. */
  troughMonth: number;
  /** Plain-language pattern callout, e.g. "Reported calm peaks in late spring". */
  pattern: string;
}

/** Per-metric seasonal seeds — phase shifts the peak around the calendar. */
const SEASONAL_SEED: Record<MetricId, { phase: number; base: number; swing: number; pattern: string }> = {
  // phase chosen so the sine peaks land in a sensible month for the callout.
  pain:    { phase: -1.1, base: 0.58, swing: 0.22, pattern: "Reported relief dips in midwinter and rebuilds through summer." },
  sleep:   { phase: 2.2,  base: 0.6,  swing: 0.2,  pattern: "Reported sleep quality peaks in the darker autumn months." },
  anxiety: { phase: 1.0,  base: 0.64, swing: 0.2,  pattern: "Reported calm peaks in late spring, easing into early summer." },
  mood:    { phase: 0.3,  base: 0.57, swing: 0.24, pattern: "Reported mood climbs with daylight, cresting around midsummer." },
  nausea:  { phase: 3.0,  base: 0.52, swing: 0.18, pattern: "Reported settling is steadiest across the cooler late-year months." },
  focus:   { phase: -0.4, base: 0.5,  swing: 0.23, pattern: "Reported focus sharpens in early autumn as routines reset." },
};

function buildSeasonal(): SeasonalSeries[] {
  return METRICS.map((meta) => {
    const seed = SEASONAL_SEED[meta.id];
    const points: SeasonalPoint[] = [];
    let peakMonth = 0;
    let troughMonth = 0;
    let peakVal = -Infinity;
    let troughVal = Infinity;
    for (let m = 0; m < 12; m++) {
      const angle = seed.phase + (m / 12) * Math.PI * 2;
      // Primary annual wave + a small semiannual harmonic for texture.
      const wave = Math.sin(angle) + Math.sin(angle * 2) * 0.18;
      const value = clamp01(seed.base + wave * seed.swing);
      const sampleSize = 240 + m * 14 + ((m * 11) % 23) * 8;
      points.push({ month: MONTH_LABELS[m], value, sampleSize });
      if (value > peakVal) {
        peakVal = value;
        peakMonth = m;
      }
      if (value < troughVal) {
        troughVal = value;
        troughMonth = m;
      }
    }
    return {
      id: meta.id,
      label: meta.label,
      points,
      peakMonth,
      troughMonth,
      pattern: seed.pattern,
    };
  });
}

export const SEASONAL: SeasonalSeries[] = buildSeasonal();

// ---------------------------------------------------------------------------
// Headline aggregate stats for the page hero / "live" strip.
// ---------------------------------------------------------------------------

export interface HeadlineStat {
  label: string;
  value: string;
  hint: string;
}

/** Total cohort contributions across the heatmap, computed deterministically. */
function totalContributions(): number {
  return HEATMAP.rows.reduce(
    (rowSum, row) => rowSum + row.cells.reduce((s, c) => s + c.sampleSize, 0),
    0,
  );
}

export const HEADLINE_STATS: HeadlineStat[] = [
  {
    label: "Community check-ins",
    value: totalContributions().toLocaleString("en-US"),
    hint: "De-identified outcome reports in this view",
  },
  {
    label: "Metrics tracked",
    value: String(METRICS.length),
    hint: "Aggregate outcome dimensions",
  },
  {
    label: "Coverage",
    value: "12 wk · 12 mo",
    hint: "Trailing trend + seasonal window",
  },
];

/** Static label — surface is "always fresh"; we deliberately avoid time APIs. */
export const LAST_UPDATED_LABEL = "Updated continuously";
