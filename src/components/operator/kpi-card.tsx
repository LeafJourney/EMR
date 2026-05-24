import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// KpiCard — a single owner-dashboard tile.
//
// Apple-iOS-ish: rounded-2xl, soft border, generous padding, big tabular
// headline, quiet trend indicator. The whole tile is a click target.
// A severity dot in the top-right communicates urgency at a glance.
// ---------------------------------------------------------------------------

export type KpiSeverity = "good" | "warn" | "bad";
export type KpiTrendDirection = "up" | "down" | "flat";

export interface KpiTrend {
  direction: KpiTrendDirection;
  /** percent change vs prior period; null when prior was 0 */
  percent: number | null;
  /** "up" can be good (revenue) or bad (denials); the card decides */
  goodWhen: "up" | "down" | "either";
}

export interface KpiCardProps {
  eyebrow: string;
  /**
   * Headline shown as the big number. Accepts a string for static rendering
   * or a ReactNode (e.g. `<AnimatedNumber value={...} />`) for tweened
   * counters. Either way the wrapper applies tabular-nums for width stability.
   */
  headline: React.ReactNode;
  /** Optional fallback string for aria-label when `headline` is a ReactNode. */
  headlineLabel?: string;
  subtext?: string;
  href: string;
  trend?: KpiTrend;
  severity?: KpiSeverity;
  /** Subtle pulsing dot next to the headline (e.g. "agent running"). */
  pulse?: boolean;
  className?: string;
}

const SEVERITY_DOT: Record<KpiSeverity, string> = {
  good: "bg-accent",
  warn: "bg-highlight",
  bad: "bg-[color:var(--danger)]",
};

export function KpiCard({
  eyebrow,
  headline,
  headlineLabel,
  subtext,
  href,
  trend,
  severity,
  pulse,
  className,
}: KpiCardProps) {
  // Stringify a ReactNode for screen-reader aria-label fallback when caller
  // didn't pass an explicit headlineLabel. We only need a sane string — the
  // AnimatedNumber primitive already exposes its own aria-label internally.
  const headlineAria =
    headlineLabel ??
    (typeof headline === "string" || typeof headline === "number"
      ? String(headline)
      : "");

  return (
    <Link
      href={href}
      aria-label={`${eyebrow}: ${headlineAria}`}
      className={cn(
        "group relative block rounded-2xl border border-border/80 bg-surface-raised",
        "shadow-sm transition-all duration-200 ease-smooth",
        "hover:shadow-md hover:-translate-y-0.5 hover:border-border-strong",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "px-6 py-6",
        className,
      )}
    >
      {severity && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute right-4 top-4 h-1.5 w-1.5 rounded-full",
            SEVERITY_DOT[severity],
          )}
        />
      )}

      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
        {eyebrow}
      </p>

      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-display text-3xl font-semibold text-text tabular-nums leading-none">
          {headline}
        </span>
        {pulse && (
          <span
            aria-hidden="true"
            className="relative flex h-2 w-2"
            title="Live"
          >
            <span className="absolute inset-0 rounded-full bg-accent/60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
        )}
        {trend && trend.direction !== "flat" && (
          <KpiTrendBadge trend={trend} />
        )}
      </div>

      {subtext && (
        <p className="text-xs text-text-muted mt-3 leading-snug">{subtext}</p>
      )}
    </Link>
  );
}

function KpiTrendBadge({ trend }: { trend: KpiTrend }) {
  const isUp = trend.direction === "up";
  const isGood =
    trend.goodWhen === "either"
      ? true
      : (trend.goodWhen === "up" && isUp) || (trend.goodWhen === "down" && !isUp);

  const color = isGood ? "text-accent" : "text-danger";

  const arrow = isUp ? "\u2191" : "\u2193";
  const pct =
    trend.percent === null
      ? "new"
      : `${Math.abs(trend.percent).toFixed(trend.percent % 1 === 0 ? 0 : 1)}%`;

  return (
    <span className={cn("text-xs font-medium tabular-nums", color)}>
      {arrow} {pct}
    </span>
  );
}
