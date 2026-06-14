// ---------------------------------------------------------------------------
// Telemetry normalization — spec Phase 2 "Multi-Domain Data Merging &
// Automated Feature Engineering" (Linear EMR-1127).
//
// Continuous wearable streams are downsampled into uniform daily statistical
// summaries, then reduced to the two scalars the IR_risk model consumes:
//   - σ_cgm   : 14-day coefficient of variation of interstitial glucose
//   - ΔHRV    : reduction in recent nocturnal HRV vs a longer-term baseline
//
// All pure + deterministic with an injectable clock so tests are stable.
// ---------------------------------------------------------------------------

import {
  CGM_VARIABILITY_WINDOW_DAYS,
  type NormalizedTelemetry,
  type TelemetryPoint,
  type WearableTelemetry,
} from "./types";

const DAY_MS = 86_400_000;
/** Recent nocturnal-HRV window used as the "now" leg of the ΔHRV delta. */
const HRV_RECENT_DAYS = 7;
/** Long-term baseline window (the leg ΔHRV is measured against). */
const HRV_BASELINE_DAYS = 30;

function toMs(at: string | Date): number {
  return at instanceof Date ? at.getTime() : new Date(at).getTime();
}

/** One calendar day's mean for a downsampled stream. */
export interface DailySummary {
  /** UTC start-of-day epoch ms. */
  dayStartMs: number;
  mean: number;
}

/**
 * Downsample raw points into one mean value per UTC calendar day, ascending.
 * Non-finite values/timestamps are skipped rather than poisoning a bucket.
 */
export function downsampleToDaily(points: TelemetryPoint[]): DailySummary[] {
  const buckets = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    const ms = toMs(p.at);
    if (!Number.isFinite(ms) || !Number.isFinite(p.value)) continue;
    const dayStart = Math.floor(ms / DAY_MS) * DAY_MS;
    const b = buckets.get(dayStart) ?? { sum: 0, n: 0 };
    b.sum += p.value;
    b.n += 1;
    buckets.set(dayStart, b);
  }
  return [...buckets.entries()]
    .map(([dayStartMs, b]) => ({ dayStartMs, mean: b.sum / b.n }))
    .sort((a, b) => a.dayStartMs - b.dayStartMs);
}

/** Median of a numeric series, or null when empty. */
export function median(values: number[]): number | null {
  const xs = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * Population coefficient of variation (%) — σ/μ × 100. Needs ≥2 finite
 * points and a non-zero mean; otherwise null (variability is undefined).
 */
export function coefficientOfVariationPct(values: number[]): number | null {
  const xs = values.filter(Number.isFinite);
  if (xs.length < 2) return null;
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  if (mean === 0) return null;
  const variance = xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length;
  return (Math.sqrt(variance) / Math.abs(mean)) * 100;
}

/**
 * Reduce raw wearable streams to the model's two telemetry scalars.
 *
 * σ_cgm is the CV across the last `CGM_VARIABILITY_WINDOW_DAYS` of daily-mean
 * glucose. ΔHRV is `max(0, baselineMedian − recentMedian)` so only genuine
 * drops (autonomic stress) raise risk — an improving HRV never does. The
 * baseline excludes the recent window so a sustained decline is actually
 * visible in the delta.
 */
export function normalizeTelemetry(
  telemetry: WearableTelemetry | undefined,
  now: Date = new Date()
): NormalizedTelemetry {
  const nowMs = now.getTime();

  const cgmDaily = downsampleToDaily(telemetry?.cgm ?? []);
  const cgmWindow = cgmDaily.filter(
    (d) => d.dayStartMs >= nowMs - CGM_VARIABILITY_WINDOW_DAYS * DAY_MS
  );
  const cgmVariabilityPct = coefficientOfVariationPct(
    cgmWindow.map((d) => d.mean)
  );

  const hrvDaily = downsampleToDaily(telemetry?.nocturnalHrv ?? []);
  const recent = hrvDaily.filter(
    (d) => d.dayStartMs >= nowMs - HRV_RECENT_DAYS * DAY_MS
  );
  const baseline = hrvDaily.filter(
    (d) =>
      d.dayStartMs < nowMs - HRV_RECENT_DAYS * DAY_MS &&
      d.dayStartMs >= nowMs - HRV_BASELINE_DAYS * DAY_MS
  );
  const recentMed = median(recent.map((d) => d.mean));
  const baselineMed = median(baseline.map((d) => d.mean));
  const hrvReductionMs =
    recentMed != null && baselineMed != null
      ? Math.max(0, baselineMed - recentMed)
      : null;

  return {
    cgmVariabilityPct,
    hrvReductionMs,
    cgmDays: cgmWindow.length,
    hrvDays: baseline.length,
  };
}
