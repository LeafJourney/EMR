// EMR-914 — pure view-model for the portal "Get ready for your visit" banner.
// Kept separate from the server component so the show/hide + framing logic is
// unit-testable without rendering React or touching the DB.

import type {
  MissingRequirement,
  UpcomingVisitReadiness,
} from "@/lib/scheduling/previsit-readiness";

const DAY_MS = 24 * 60 * 60_000;

export interface PrevisitBannerView {
  /** 0..100, for the progress bar. */
  completionPct: number;
  /** Human framing of how soon the visit is ("today" / "tomorrow" / "in 5 days"). */
  whenLabel: string;
  /** The outstanding items to surface, label + deep link. */
  items: MissingRequirement[];
}

/**
 * Decide whether the banner shows and, if so, its framing. Returns null when
 * there's no upcoming visit, the patient is already ready, or nothing
 * phone/portal-actionable is outstanding — the banner should not render at all
 * in those cases (no "you're all done" noise on the dashboard).
 */
export function buildPrevisitBannerView(
  view: UpcomingVisitReadiness | null,
  now: Date,
): PrevisitBannerView | null {
  if (!view) return null;
  if (view.readiness.isReady) return null;
  if (view.missingRequirements.length === 0) return null;

  return {
    completionPct: Math.round(view.readiness.completionPct * 100),
    whenLabel: describeWhen(view.startAt, now),
    items: view.missingRequirements,
  };
}

/**
 * Countdown copy by UTC calendar day (so "in 5 days" matches the patient's sense
 * of the date, and lines up with the nudge engine's 7/2/0-day milestones).
 * Clamps today/past to "today".
 */
export function describeWhen(startAt: Date, now: Date): string {
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const b = Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate());
  const days = Math.round((b - a) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
