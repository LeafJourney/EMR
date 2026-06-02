/**
 * EMR-062 — Ancillary services queue logic
 *
 * The ancillary services hub (`/clinic/ancillary`) renders OT, PT,
 * speech, case management, and home-health referrals in a single
 * queue. This module is the pure layer:
 *
 *   - canonical Discipline + Status types,
 *   - queue filtering & sorting,
 *   - staleness detection (the "no movement in N days" tile),
 *   - sign-off back to the primary provider on completion.
 *
 * Keeping the math here means the page component stays a thin
 * presentation layer and the same rules drive any AI summary that
 * needs to talk about open referrals (e.g., the morning brief).
 */

export type AncillaryDiscipline =
  | "ot"
  | "pt"
  | "speech"
  | "case_mgmt"
  | "home_health";

export type AncillaryStatus =
  | "pending"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "declined";

export const DISCIPLINE_LABEL: Record<AncillaryDiscipline, string> = {
  ot: "Occupational therapy",
  pt: "Physical therapy",
  speech: "Speech & language",
  case_mgmt: "Case management",
  home_health: "Home health",
};

/** Canonical render order for discipline cards / tabs. */
export const ALL_DISCIPLINES: AncillaryDiscipline[] = [
  "ot",
  "pt",
  "speech",
  "case_mgmt",
  "home_health",
];

const DISCIPLINE_SET = new Set<string>(ALL_DISCIPLINES);

/**
 * Parse a `?discipline=` query-string value into a canonical discipline,
 * or `undefined` when it's absent / not a recognized discipline. Keeps the
 * page from trusting raw URL input.
 */
export function disciplineFromParam(
  raw: string | string[] | undefined,
): AncillaryDiscipline | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && DISCIPLINE_SET.has(value)) return value as AncillaryDiscipline;
  return undefined;
}

export interface AncillaryReferral {
  id: string;
  discipline: AncillaryDiscipline;
  patientName: string;
  /** ID of the primary provider who placed the order. */
  orderedByUserId: string;
  reason: string;
  status: AncillaryStatus;
  /** ISO date the order was placed. */
  orderedAt: string;
  /** ISO date of the most recent activity (intake, eval, note). */
  lastActivityAt?: string;
  nextStep?: string;
}

/** Open buckets — anything not yet completed or declined. */
const OPEN_STATUSES: Set<AncillaryStatus> = new Set([
  "pending",
  "scheduled",
  "in_progress",
]);

export function isOpen(referral: AncillaryReferral): boolean {
  return OPEN_STATUSES.has(referral.status);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function ageDays(
  referral: AncillaryReferral,
  now: Date = new Date(),
): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(referral.orderedAt)) / MS_PER_DAY));
}

export function daysSinceMovement(
  referral: AncillaryReferral,
  now: Date = new Date(),
): number {
  const last = referral.lastActivityAt ?? referral.orderedAt;
  return Math.max(0, Math.floor((now.getTime() - Date.parse(last)) / MS_PER_DAY));
}

/**
 * "Stale" = no recorded activity for 14 days while still open. Real-world
 * threshold most ancillary teams use as the cutoff before chasing.
 */
export const STALE_THRESHOLD_DAYS = 14;

export function isStale(
  referral: AncillaryReferral,
  now: Date = new Date(),
): boolean {
  if (!isOpen(referral)) return false;
  return daysSinceMovement(referral, now) >= STALE_THRESHOLD_DAYS;
}

// ---------------------------------------------------------------------------
// Sort + filter
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<AncillaryStatus, number> = {
  pending: 0,
  in_progress: 1,
  scheduled: 2,
  declined: 3,
  completed: 4,
};

/**
 * Order the queue the way clinicians scan it: urgent + stale first,
 * then by status priority, then oldest first within ties.
 */
export function sortQueue(
  referrals: AncillaryReferral[],
  now: Date = new Date(),
): AncillaryReferral[] {
  return [...referrals].sort((a, b) => {
    const sa = isStale(a, now) ? 0 : 1;
    const sb = isStale(b, now) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (so !== 0) return so;
    return Date.parse(a.orderedAt) - Date.parse(b.orderedAt);
  });
}

export interface QueueFilter {
  discipline?: AncillaryDiscipline;
  status?: AncillaryStatus;
  /** When true, restrict to "open" items only. */
  openOnly?: boolean;
}

export function filterQueue(
  referrals: AncillaryReferral[],
  filter: QueueFilter,
): AncillaryReferral[] {
  return referrals.filter((r) => {
    if (filter.discipline && r.discipline !== filter.discipline) return false;
    if (filter.status && r.status !== filter.status) return false;
    if (filter.openOnly && !isOpen(r)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Rollups
// ---------------------------------------------------------------------------

export interface DisciplineRollup {
  discipline: AncillaryDiscipline;
  label: string;
  caseload: number;
  pendingIntake: number;
  staleCount: number;
}

export function rollupByDiscipline(
  referrals: AncillaryReferral[],
  now: Date = new Date(),
): DisciplineRollup[] {
  const out: Record<AncillaryDiscipline, DisciplineRollup> = {
    ot: { discipline: "ot", label: DISCIPLINE_LABEL.ot, caseload: 0, pendingIntake: 0, staleCount: 0 },
    pt: { discipline: "pt", label: DISCIPLINE_LABEL.pt, caseload: 0, pendingIntake: 0, staleCount: 0 },
    speech: { discipline: "speech", label: DISCIPLINE_LABEL.speech, caseload: 0, pendingIntake: 0, staleCount: 0 },
    case_mgmt: { discipline: "case_mgmt", label: DISCIPLINE_LABEL.case_mgmt, caseload: 0, pendingIntake: 0, staleCount: 0 },
    home_health: { discipline: "home_health", label: DISCIPLINE_LABEL.home_health, caseload: 0, pendingIntake: 0, staleCount: 0 },
  };
  for (const r of referrals) {
    const bucket = out[r.discipline];
    if (isOpen(r)) bucket.caseload += 1;
    if (r.status === "pending") bucket.pendingIntake += 1;
    if (isStale(r, now)) bucket.staleCount += 1;
  }
  return Object.values(out);
}

export interface QueueSummary {
  /** Open referrals across every discipline. */
  activeCaseload: number;
  /** Open referrals still awaiting their first eval / auth. */
  pendingIntake: number;
  /** Open referrals in the current (already-filtered) view. */
  open: number;
  /** Open referrals with no movement past the stale threshold. */
  stale: number;
}

/**
 * Top-of-page metric rollup for a (possibly already-filtered) set of
 * referrals. Keeps the four hero tiles honest — every number is derived
 * from the same rules the queue rows use.
 */
export function queueSummary(
  referrals: AncillaryReferral[],
  now: Date = new Date(),
): QueueSummary {
  let activeCaseload = 0;
  let pendingIntake = 0;
  let stale = 0;
  for (const r of referrals) {
    if (!isOpen(r)) continue;
    activeCaseload += 1;
    if (r.status === "pending") pendingIntake += 1;
    if (isStale(r, now)) stale += 1;
  }
  return { activeCaseload, pendingIntake, open: activeCaseload, stale };
}

// ---------------------------------------------------------------------------
// Sign-off back to primary provider
// ---------------------------------------------------------------------------

export interface CompletionSignOff {
  referralId: string;
  /** Plain-language summary the ancillary clinician wrote at discharge. */
  summary: string;
  /** Recommendations to the primary provider. */
  recommendations: string[];
  /** Plan of care (e.g., HEP, follow-up frequency). */
  planOfCare?: string;
  /** Optional functional outcome — Oswestry, Berg balance, FIM, etc. */
  outcome?: { instrument: string; baseline: number; current: number };
}

export interface SignOffResult {
  ok: boolean;
  errors: string[];
}

export function validateSignOff(input: CompletionSignOff): SignOffResult {
  const errors: string[] = [];
  if (!input.referralId.trim()) errors.push("referralId is required");
  if (input.summary.trim().length < 20) {
    errors.push("summary should be at least 20 characters — explain what changed");
  }
  if (input.recommendations.length === 0) {
    errors.push("at least one recommendation is required for the primary provider");
  }
  if (input.outcome) {
    if (Number.isNaN(input.outcome.baseline) || Number.isNaN(input.outcome.current)) {
      errors.push("outcome values must be numeric");
    }
  }
  return { ok: errors.length === 0, errors };
}
