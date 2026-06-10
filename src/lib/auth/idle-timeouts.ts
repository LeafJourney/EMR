import type { Role } from "@prisma/client";

// Per-role idle-timeout budgets.
//
// HIPAA's Security Rule does not name a number, but the recommended
// safeguard is automatic logoff after a period of inactivity. The values
// below balance that safeguard against day-to-day usability — a too-short
// idle budget that signs people out mid-task reads as broken and trains
// users to defeat it.
//
//   - PHI-touching staff (clinician, midlevel, back/front office, operator,
//     practice_owner, practice_admin, system) → 20 min idle
//   - LeafJourney internal admins (super_admin, implementation_admin)
//     → 20 min idle (was 10; the tighter budget was needlessly disruptive)
//   - Patients on their own portal → 30 min idle (personal device,
//     friction-light)
//   - Kiosk → 3 min (shared public waiting-room device; intentionally short
//     and deliberately NOT raised — it holds no PHI but must reset fast)
//
// The absolute session cap (`ABSOLUTE_SESSION_MS`) is layered on top:
// even with continuous activity, a session ends after 12 hours so the
// classic "left a clinic workstation logged in overnight" case is
// bounded.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const IDLE_LIMITS_MS: Record<Role, number> = {
  patient: 30 * MINUTE,
  clinician: 20 * MINUTE,
  // EMR-786 — Mid-level providers and back/front-office staff sit on
  // the clinic floor with shared workstations, so we hold them to the
  // same PHI-staff budget.
  midlevel: 20 * MINUTE,
  back_office: 20 * MINUTE,
  front_office: 20 * MINUTE,
  operator: 20 * MINUTE,
  practice_owner: 20 * MINUTE,
  practice_admin: 20 * MINUTE,
  system: 20 * MINUTE,
  implementation_admin: 20 * MINUTE,
  super_admin: 20 * MINUTE,
  leafnerd: 30 * MINUTE,
  // Shared front-desk device in a public waiting room — the tightest idle
  // budget so a walk-in can never leave the kiosk parked on a half-finished
  // lookup. The surface holds no PHI, but a short reset keeps it clean.
  kiosk: 3 * MINUTE,
};

/** Absolute cap on session age — applies regardless of activity. */
export const ABSOLUTE_SESSION_MS = 12 * HOUR;

/** How long the soft warning sits on screen before we force sign-out. */
export const IDLE_WARNING_MS = 60_000;

/**
 * Pick the timeout for a user. When a user holds multiple roles, we use
 * the SHORTEST budget so the most privileged role's policy wins — e.g.
 * a super_admin who is also a patient still gets the 10-min internal-admin
 * timeout, not the 30-min patient one.
 */
export function idleLimitForRoles(roles: Role[]): number {
  if (roles.length === 0) return IDLE_LIMITS_MS.patient;
  let min = Number.POSITIVE_INFINITY;
  for (const r of roles) {
    const limit = IDLE_LIMITS_MS[r];
    if (limit !== undefined && limit < min) min = limit;
  }
  return Number.isFinite(min) ? min : IDLE_LIMITS_MS.patient;
}

// ---------------------------------------------------------------------------
// Session-state evaluator
//
// The IdleTimeoutGuard runs two clocks (idle + absolute) and on each
// tick has to decide one of three outcomes: keep watching, show the
// warning modal, or force sign-out. The decision is a pure function of
// the timestamps + the configured limits, so we extract it here for
// exhaustive unit testing. The React component is then just an event
// pump that feeds `now`, `lastActivityAt`, and `sessionStartedAt` into
// this function and renders the result.
// ---------------------------------------------------------------------------

export type SessionTimeoutReason = "idle" | "session_max";

export type SessionDecision =
  | { kind: "ok" }
  | { kind: "warn"; reason: SessionTimeoutReason; secondsLeft: number }
  | { kind: "force_signout"; reason: SessionTimeoutReason };

export interface SessionEvaluationInput {
  /** Wall-clock now, in ms. Caller passes Date.now() in prod; tests pass a fixed value. */
  now: number;
  /** Last user-activity timestamp from the idle tracker, in ms. */
  lastActivityAt: number;
  /** Absolute session-start timestamp (first authenticated page-load), in ms. */
  sessionStartedAt: number;
  /** Per-role idle budget, in ms. Result of idleLimitForRoles(). */
  idleLimitMs: number;
  /**
   * Overrides for testing or per-deployment tuning. Production uses the
   * module defaults: 12h absolute cap, 60s warning window.
   */
  absoluteCapMs?: number;
  warningMs?: number;
}

/**
 * Evaluate the two session clocks and decide what the guard should do.
 *
 * Semantics:
 *   - Either clock at/past zero → force_signout with that clock's reason.
 *     The absolute clock wins ties so the user gets the more accurate
 *     "you hit the 12-hour cap" message instead of "you went idle".
 *   - Whichever clock is CLOSER to zero drives the reason + countdown.
 *     This matters for the last minute of a 12-hour session: the warning
 *     should say "session ending" even if the user is still actively
 *     clicking.
 *   - If the closer clock has more than `warningMs` left → "ok",
 *     hide the modal.
 *   - secondsLeft is `ceil(remaining / 1000)`, floor of 1 — so the
 *     UI never shows "0s" before the actual sign-out fires.
 */
export function evaluateSession(input: SessionEvaluationInput): SessionDecision {
  const cap = input.absoluteCapMs ?? ABSOLUTE_SESSION_MS;
  const warn = input.warningMs ?? IDLE_WARNING_MS;

  const idleRemaining = input.idleLimitMs - (input.now - input.lastActivityAt);
  const sessionRemaining = cap - (input.now - input.sessionStartedAt);

  if (sessionRemaining <= 0) return { kind: "force_signout", reason: "session_max" };
  if (idleRemaining <= 0) return { kind: "force_signout", reason: "idle" };

  // Tie-break on session_max: when both have the same remaining time, the
  // user is hitting the absolute cap regardless of activity, so surface
  // that as the reason.
  const reason: SessionTimeoutReason =
    sessionRemaining <= idleRemaining ? "session_max" : "idle";
  const remaining = Math.min(idleRemaining, sessionRemaining);

  if (remaining > warn) return { kind: "ok" };

  const secondsLeft = Math.max(1, Math.ceil(remaining / 1000));
  return { kind: "warn", reason, secondsLeft };
}
