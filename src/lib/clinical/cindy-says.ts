/**
 * "Cindy" — the chart's AI analyst voice.
 *
 * Dr. Patel asks for a recurring AI summary block in many places, branded
 * by surface: "Cindy's Summary" (Correspondence), "Cindy Says" (Images
 * subtabs, Assessment/Lab/Vital trend popups), "Cindy Sees" (LeafAnatomy),
 * "Cindy suggests" (Treatment Goals). They all share the same shape: a
 * short title-cased lead-in followed by 1–5 plain-language bullets.
 *
 * The production system routes these through the configured model client.
 * This module is the *deterministic fallback / scaffold*: it derives honest,
 * data-grounded bullets from the structured values we already have, so the
 * UI is fully functional offline and the live model can swap in later behind
 * the same interface. Pure + testable — no React, no network.
 */

export type CindyVoice = "says" | "sees" | "summary" | "suggests";

export const CINDY_PREFIX: Record<CindyVoice, string> = {
  says: "Cindy says:",
  sees: "Cindy sees:",
  summary: "Cindy's Summary",
  suggests: "Cindy suggests:",
};

export interface CindyAnalysis {
  voice: CindyVoice;
  prefix: string;
  bullets: string[];
}

/** Round to at most 1 decimal and drop a trailing ".0". */
function num(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Describe a slope across an ordered numeric series. */
export function describeTrend(
  values: number[],
  unit = "",
): string | null {
  const clean = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (clean.length < 2) return null;
  const first = clean[0];
  const last = clean[clean.length - 1];
  const delta = last - first;
  const u = unit ? ` ${unit}` : "";
  if (Math.abs(delta) < 1e-9 || (first !== 0 && Math.abs(delta / first) < 0.03)) {
    return `Holding steady around ${num(last)}${u} across the last ${clean.length} readings.`;
  }
  const dir = delta > 0 ? "up" : "down";
  return `Trending ${dir} from ${num(first)}${u} to ${num(last)}${u} over the last ${clean.length} readings (${delta > 0 ? "+" : ""}${num(delta)}${u}).`;
}

export interface TrendInput {
  label: string;
  values: number[];
  unit?: string;
  /** Optional latest interpretation, e.g. "moderate". */
  interpretation?: string | null;
}

/**
 * Build a "Cindy says" trend analysis for a single measure (used by the
 * Feather trend popups on Assessment/Lab/Vital titles — EMR-870/871/872).
 */
export function cindyTrend(input: TrendInput, voice: CindyVoice = "says"): CindyAnalysis {
  const bullets: string[] = [];
  const trend = describeTrend(input.values, input.unit);
  if (trend) bullets.push(`${input.label}: ${trend}`);
  if (input.interpretation) {
    bullets.push(`Most recent reading reads as "${input.interpretation}".`);
  }
  if (bullets.length === 0) {
    bullets.push(
      `Not enough ${input.label} history yet to chart a trend — one data point on file.`,
    );
  }
  return { voice, prefix: CINDY_PREFIX[voice], bullets };
}

export interface SummaryItem {
  title: string;
  meta?: string;
}

/**
 * Build a 1–2 bullet "Cindy's Summary" of a list of recent items (the
 * Correspondence inbox summary, Records/LSV hover summary, Images Cindy
 * Says — EMR-895/862/868/902). Grounded entirely in the provided items so
 * it never fabricates.
 */
export function cindyListSummary(
  items: SummaryItem[],
  opts: { voice?: CindyVoice; noun?: string; maxBullets?: number } = {},
): CindyAnalysis {
  const voice = opts.voice ?? "summary";
  const noun = opts.noun ?? "items";
  const maxBullets = opts.maxBullets ?? 2;
  const bullets: string[] = [];

  if (items.length === 0) {
    bullets.push(`No ${noun} on file yet.`);
    return { voice, prefix: CINDY_PREFIX[voice], bullets };
  }

  const newest = items[0];
  bullets.push(
    `${items.length} ${noun} on file — most recent: ${newest.title}${newest.meta ? ` (${newest.meta})` : ""}.`,
  );

  if (items.length > 1 && maxBullets > 1) {
    const others = items
      .slice(1, 4)
      .map((i) => i.title)
      .join("; ");
    if (others) bullets.push(`Also recent: ${others}.`);
  }

  return { voice, prefix: CINDY_PREFIX[voice], bullets: bullets.slice(0, maxBullets) };
}

/**
 * Build a "Cindy Sees" radiology-style read from an image type + report
 * text (EMR-899/902). Heuristic keyword scan over the report; honest about
 * being a draft read pending a model/radiologist.
 */
export function cindyImageRead(
  imageType: string,
  reportText: string | null | undefined,
): CindyAnalysis {
  const bullets: string[] = [];
  bullets.push(`${imageType}: image loaded and indexed to the anatomical model.`);
  const t = (reportText ?? "").toLowerCase();
  if (t) {
    if (/(no acute|unremarkable|within normal|normal study)/.test(t)) {
      bullets.push("Report language reads as a normal / unremarkable study.");
    }
    const flags: string[] = [];
    if (/(mass|lesion|nodule)/.test(t)) flags.push("a mass/nodule/lesion");
    if (/(fracture|fx)/.test(t)) flags.push("a possible fracture");
    if (/(hemorrhage|bleed)/.test(t)) flags.push("hemorrhage");
    if (/(effusion|edema)/.test(t)) flags.push("effusion/edema");
    if (/(stenosis|occlusion|narrow)/.test(t)) flags.push("vascular narrowing");
    if (flags.length) {
      bullets.push(`Report mentions ${flags.join(", ")} — confirm against the images.`);
    }
  } else {
    bullets.push("No text report attached yet — read is from the image series only.");
  }
  bullets.push("Draft read — verify before charting.");
  return { voice: "sees", prefix: CINDY_PREFIX.sees, bullets: bullets.slice(0, 5) };
}
