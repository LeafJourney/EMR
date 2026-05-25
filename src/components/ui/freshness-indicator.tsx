"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * FreshnessIndicator — a small chip showing how stale a server-rendered
 * data surface is, plus a click-to-refresh affordance.
 *
 * Why this exists:
 * Many EMR surfaces (KPI tiles, audit log, queue, communications hub) are
 * server-rendered with data fetched once on load. The user has no signal
 * whether the numbers in front of them are 5 seconds or 50 minutes old,
 * and no obvious way to ask for a re-fetch short of a full browser reload.
 * This component gives them both: a relative-time label that auto-updates
 * every 30s, and a refresh button that the caller wires to either
 * `router.refresh()` (Next.js app router) or a server action.
 *
 * Deliberate non-features:
 *   - No background polling. Refresh is human-triggered or, via the
 *     companion `useStaleRefresh` hook, fires when the tab regains focus
 *     after a configurable staleness threshold. We do NOT bang the server
 *     on a setInterval — that's a footgun on data-heavy pages.
 *   - No "live" optimistic strings. We only flip to a fresh `since` after
 *     the caller hands us a new timestamp, otherwise the chip would lie
 *     about freshness whenever a refresh failed silently.
 */

export type FreshnessStatus = "idle" | "refreshing" | "error";

export interface FreshnessIndicatorProps {
  /** ISO timestamp of when the underlying data was loaded. */
  since: string;
  /** Optional click handler. If omitted, the refresh button is hidden. */
  onRefresh?: () => void | Promise<void>;
  /** External status override (e.g. caller already has a pending action). */
  status?: FreshnessStatus;
  /** A11y label / tooltip on the refresh button. */
  refreshLabel?: string;
  /** Extra classes for the outer chip. */
  className?: string;
  /** Render compact (smaller padding, no dot). */
  compact?: boolean;
}

/** Buckets we use to pick the dot colour and the verbose copy. */
type Freshness = "fresh" | "neutral" | "stale";

function bucket(ageMs: number): Freshness {
  if (ageMs < 2 * 60_000) return "fresh";
  if (ageMs < 15 * 60_000) return "neutral";
  return "stale";
}

/**
 * Format a relative time string. Intentionally inline — pulling in
 * date-fns or Intl.RelativeTimeFormat for one widget is overkill, and
 * inline lets us guarantee SSR/CSR text parity for the first paint.
 */
function relative(ageMs: number): string {
  if (ageMs < 5_000) return "just now";
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}s ago`;
  if (ageMs < 60 * 60_000) return `${Math.round(ageMs / 60_000)}m ago`;
  if (ageMs < 24 * 60 * 60_000) return `${Math.round(ageMs / (60 * 60_000))}h ago`;
  return `${Math.round(ageMs / (24 * 60 * 60_000))}d ago`;
}

const DOT_TONE: Record<Freshness, string> = {
  fresh: "bg-emerald-500",
  neutral: "bg-text-subtle",
  stale: "bg-amber-500",
};

/**
 * Calls onRefresh when the tab becomes visible after the page has been
 * hidden (or simply blurred) for longer than `thresholdMs`. Designed to
 * pair with FreshnessIndicator on dashboards — a clinician closes the
 * laptop for an hour, walks back, the page silently re-pulls.
 *
 * Caller passes the most-recent `since` so the threshold is measured
 * against the actual data age, not just visibility duration. We guard on
 * `document.visibilityState === "visible"` so synthetic focus events
 * (e.g. a focus on a popover) don't trigger spurious refreshes.
 */
export function useStaleRefresh(opts: {
  since: string;
  thresholdMs?: number;
  onRefresh: () => void | Promise<void>;
  enabled?: boolean;
}): void {
  const { since, thresholdMs = 5 * 60 * 1000, onRefresh, enabled = true } = opts;

  // Stash the latest onRefresh in a ref so the effect doesn't re-bind every
  // render when callers pass an inline arrow.
  const refreshRef = React.useRef(onRefresh);
  refreshRef.current = onRefresh;

  React.useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    let firing = false;
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      if (firing) return;
      const ts = Date.parse(since);
      if (!Number.isFinite(ts)) return;
      const age = Date.now() - ts;
      if (age < thresholdMs) return;
      firing = true;
      Promise.resolve(refreshRef.current())
        .catch(() => {
          /* swallow — caller surfaces errors via `status` */
        })
        .finally(() => {
          firing = false;
        });
    };

    document.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
    };
  }, [since, thresholdMs, enabled]);
}

export function FreshnessIndicator({
  since,
  onRefresh,
  status,
  refreshLabel = "Refresh",
  className,
  compact = false,
}: FreshnessIndicatorProps) {
  // Internal pending state for when the caller didn't pass `status`. We
  // still defer to the prop when present so a parent that already tracks
  // a server action can control us.
  const [internalPending, setInternalPending] = React.useState(false);
  const refreshing = status === "refreshing" || internalPending;
  const isError = status === "error";

  // Tick a counter every 30s so the relative-time label re-renders. We
  // tie the effect lifetime to mount, not to `since`, so the timer stays
  // steady across re-renders.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const parsed = React.useMemo(() => Date.parse(since), [since]);
  const ageMs = Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : null;
  const freshness: Freshness = ageMs == null ? "neutral" : bucket(ageMs);

  const label = refreshing
    ? "Updating…"
    : ageMs == null
      ? "Updated"
      : `Updated ${relative(ageMs)}`;

  const handleClick = React.useCallback(async () => {
    if (!onRefresh || refreshing) return;
    try {
      setInternalPending(true);
      await Promise.resolve(onRefresh());
    } finally {
      setInternalPending(false);
    }
  }, [onRefresh, refreshing]);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border bg-surface-raised/70",
        "text-xs text-text-muted select-none",
        compact ? "px-2 py-0.5" : "px-2.5 py-1",
        isError ? "border-danger/40 text-danger" : "border-border/60",
        className,
      )}
      role="status"
      aria-live="polite"
      data-freshness={freshness}
    >
      {!compact && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isError ? "bg-danger" : DOT_TONE[freshness],
            refreshing && "animate-pulse",
          )}
          aria-hidden="true"
        />
      )}
      <span className="font-medium tracking-tight">
        {isError ? "Update failed" : label}
      </span>
      {onRefresh && (
        <button
          type="button"
          onClick={handleClick}
          disabled={refreshing}
          aria-label={refreshLabel}
          title={refreshLabel}
          className={cn(
            "ml-0.5 inline-flex items-center justify-center rounded-full p-1",
            "text-text-muted hover:text-text hover:bg-surface-muted",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          )}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}

FreshnessIndicator.displayName = "FreshnessIndicator";
