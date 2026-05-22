// Shared, pure formatting + color helpers for the HQ tiles. No React, no
// server imports — safe to use anywhere and trivial to unit-test.

const USD_BIG = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const USD_SMALL = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format cents → USD. Cents are dropped above the $1,000 threshold so the
 * KPI strip reads at a glance, but values under $1,000 keep two decimals so
 * single-charge debugging contexts stay legible.
 */
export function formatUSDCents(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) return USD_BIG.format(dollars);
  return USD_SMALL.format(dollars);
}

/** Integer with thousand-separators, e.g. `1,284`. */
export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

/** Render a MoM percent value as `+12% MoM`, `-3% MoM`, `±0% MoM`, or `— MoM`. */
export function formatMomPct(pct: number): string {
  if (!Number.isFinite(pct)) return "— MoM";
  if (pct === 0) return "±0% MoM";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}% MoM`;
}

export type MomTone = "positive" | "negative" | "neutral";

export function momTone(pct: number): MomTone {
  if (!Number.isFinite(pct) || pct === 0) return "neutral";
  return pct > 0 ? "positive" : "negative";
}

/**
 * Humanise a duration in hours into `Xd Yh`, `Xh Ym`, or `Xm` form.
 * Used by the onboarding funnel for median time-in-stage.
 */
export function formatHumanDurationHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0m";
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (totalHours < 24) return mins ? `${totalHours}h ${mins}m` : `${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

/** Relative-time formatter, e.g. `2m ago`, `1h ago`, `3d ago`. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now.getTime() - then);
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Canonical Linear-label colours for modalities and specialties. Centralised
 * so other dashboard surfaces can reuse them.
 */
export const MODALITY_COLORS: Record<string, string> = {
  "cannabis-medicine": "#9B51E0",
  cannabis: "#9B51E0",
  "pain-management": "#EB5757",
  pain: "#EB5757",
  "internal-medicine": "#27AE60",
  internal: "#27AE60",
};

const FALLBACK_PALETTE = [
  "#2F80ED",
  "#F2994A",
  "#56CCF2",
  "#BB6BD9",
  "#219653",
  "#F2C94C",
];

/** Return a stable colour for a modality/specialty key — canonical first, palette fallback. */
export function colorForKey(key: string, index: number = 0): string {
  return MODALITY_COLORS[key] ?? FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

/** Build a minimal SVG `<path>` `d` attribute for a sparkline over `values`. */
export function sparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `M ${points.join(" L ")}`;
}
