/**
 * Standardized "bubble" colour taxonomy for the clinician patient chart.
 *
 * Dr. Patel's revision doc repeatedly leans on coloured pill "bubbles" to
 * encode meaning at a glance, and asks for a *consistent* colour language
 * across every tab (EMR-879, EMR-880, EMR-870/871/872, EMR-897). This
 * module is the single source of truth so the Rx tab's "active = green"
 * never drifts from the LSV tab's "normal = green".
 *
 * Pure data + helpers only — no React — so it can be unit-tested and reused
 * by both server and client components. The matching <Bubble> presentational
 * component lives in the chart-kit client file.
 */

/* ── Semantic bubble tones ───────────────────────────────────────────── */

export type BubbleTone =
  // Clinical severity ramp (assessment scores, lab/vital normality)
  | "normal" // green  — normal / no issues / up-to-date
  | "mild" // yellow — mild / caution / due-soon
  | "moderate" // orange — moderate
  | "severe" // red    — severe / warning / overdue / critical
  // Rx regimen status (EMR-879)
  | "ratio" // gold/yellow — THC:CBD ratio bubble
  | "active" // green       — active regimen / medication
  | "inactive" // red         — inactive / discontinued
  // Neutral descriptive tags ("beige" bubbles — source, examples, class)
  | "beige"
  // Information / category bubbles
  | "info";

/**
 * Tailwind class string for each bubble tone. We use explicit utility
 * classes (not the Badge component's token set) because Dr. Patel calls
 * out specific hues — "orange" for moderate, "beige" for descriptive
 * sub-bubbles — that the 7-tone Badge palette doesn't cover.
 */
export const BUBBLE_CLASSES: Record<BubbleTone, string> = {
  normal: "bg-green-100 text-green-800 border-green-300",
  mild: "bg-yellow-100 text-yellow-800 border-yellow-300",
  moderate: "bg-orange-100 text-orange-800 border-orange-300",
  severe: "bg-red-100 text-red-800 border-red-300",
  ratio: "bg-amber-100 text-amber-900 border-amber-400",
  active: "bg-green-100 text-green-800 border-green-300",
  inactive: "bg-red-100 text-red-700 border-red-300",
  beige: "bg-[#f5efe2] text-[#7a6c52] border-[#e4d9c2]",
  info: "bg-blue-50 text-blue-700 border-blue-200",
};

export function bubbleClass(tone: BubbleTone): string {
  return BUBBLE_CLASSES[tone];
}

/* ── Severity inference ──────────────────────────────────────────────── */

export type SeverityBand = "normal" | "mild" | "moderate" | "severe";

/** Map a free-text interpretation string to a severity band/bubble tone. */
export function severityFromInterpretation(
  interp: string | null | undefined,
): SeverityBand {
  if (!interp) return "normal";
  const s = interp.toLowerCase();
  if (/(severe|critical|high risk|markedly|crisis)/.test(s)) return "severe";
  if (/(moderate|moderately)/.test(s)) return "moderate";
  if (/(none|normal|negative|minimal|within|good)/.test(s)) return "normal";
  if (/(mild|borderline|elevated|low risk|slight)/.test(s)) return "mild";
  return "normal";
}

/**
 * Band a numeric score against ascending thresholds. `cutoffs` are the
 * lower bounds for mild / moderate / severe respectively. Used by the
 * Assessment Scores subtab (EMR-870) for PHQ-9/GAD-7 etc.
 */
export function severityFromScore(
  score: number | null | undefined,
  cutoffs: { mild: number; moderate: number; severe: number },
): SeverityBand {
  if (score == null || Number.isNaN(score)) return "normal";
  if (score >= cutoffs.severe) return "severe";
  if (score >= cutoffs.moderate) return "moderate";
  if (score >= cutoffs.mild) return "mild";
  return "normal";
}

/** Lab/vital normality → bubble tone (EMR-871, EMR-872). */
export function normalityTone(isAbnormal: boolean): BubbleTone {
  return isAbnormal ? "severe" : "normal";
}

/* ── Per-user identity colours (EMR-897) ─────────────────────────────── */

/**
 * Every provider/staff member gets a *fixed* colour + emoji avatar so a
 * sender is recognisable at a glance across the whole chart. Deterministic
 * hash of a stable seed (userId) → palette slot, so the same person always
 * lands on the same colour without any schema column.
 */
export interface IdentityColor {
  /** Soft background for the pill/avatar. */
  bg: string;
  /** Text colour with sufficient contrast on `bg`. */
  text: string;
  /** Ring/border colour. */
  ring: string;
  /** Playful avatar emoji (Dr. Patel: "cute avatar"). */
  emoji: string;
  /** Human-readable colour name (for tooltips / aria). */
  name: string;
}

const IDENTITY_PALETTE: IdentityColor[] = [
  { bg: "bg-rose-100", text: "text-rose-800", ring: "ring-rose-300", emoji: "🌸", name: "Rose" },
  { bg: "bg-sky-100", text: "text-sky-800", ring: "ring-sky-300", emoji: "🐬", name: "Sky" },
  { bg: "bg-emerald-100", text: "text-emerald-800", ring: "ring-emerald-300", emoji: "🌿", name: "Emerald" },
  { bg: "bg-amber-100", text: "text-amber-900", ring: "ring-amber-300", emoji: "🌻", name: "Amber" },
  { bg: "bg-violet-100", text: "text-violet-800", ring: "ring-violet-300", emoji: "🔮", name: "Violet" },
  { bg: "bg-cyan-100", text: "text-cyan-800", ring: "ring-cyan-300", emoji: "🐚", name: "Cyan" },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-800", ring: "ring-fuchsia-300", emoji: "🦩", name: "Fuchsia" },
  { bg: "bg-lime-100", text: "text-lime-800", ring: "ring-lime-300", emoji: "🍃", name: "Lime" },
  { bg: "bg-indigo-100", text: "text-indigo-800", ring: "ring-indigo-300", emoji: "🫐", name: "Indigo" },
  { bg: "bg-teal-100", text: "text-teal-800", ring: "ring-teal-300", emoji: "🐢", name: "Teal" },
  { bg: "bg-orange-100", text: "text-orange-800", ring: "ring-orange-300", emoji: "🦊", name: "Orange" },
  { bg: "bg-pink-100", text: "text-pink-800", ring: "ring-pink-300", emoji: "🌷", name: "Pink" },
];

/** Stable string hash (djb2). Same seed → same number, every time. */
export function stableHash(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33) ^ seed.charCodeAt(i);
  }
  // Force unsigned 32-bit.
  return hash >>> 0;
}

export function identityColor(seed: string): IdentityColor {
  if (!seed) return IDENTITY_PALETTE[0];
  return IDENTITY_PALETTE[stableHash(seed) % IDENTITY_PALETTE.length];
}

/** Two-letter initials from a display name (e.g. "Dana Okafor" → "DO"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ── Sex-keyed demographic bubble (EMR-849) ──────────────────────────── */

export type SexColor = "female" | "male" | "neutral";

export function sexColorKey(sex: string | null | undefined): SexColor {
  if (!sex) return "neutral";
  const s = sex.trim().toLowerCase();
  if (s.startsWith("f")) return "female";
  if (s.startsWith("m")) return "male";
  return "neutral";
}

/** Pill classes for the "Adult 40y" demographic bubble, coloured by sex. */
export const SEX_BUBBLE_CLASSES: Record<SexColor, string> = {
  female: "bg-pink-100 text-pink-800 border-pink-300",
  male: "bg-blue-100 text-blue-800 border-blue-300",
  neutral: "bg-surface-muted text-text-muted border-border-strong/50",
};
