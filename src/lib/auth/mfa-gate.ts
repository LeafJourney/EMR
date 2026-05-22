// EMR-742 / EMR-725 — MFA gate (stub).
//
// `requireRecentMfa()` is the helper that EMR-725 (MFA enforcement) will
// fill in. Right now it returns `{ ok: true }` so the impersonation
// flow can land *behind* the eventual MFA check without a second PR
// after EMR-725 merges — EMR-725 just has to swap the body.
//
// We chose the helper approach (option (b) in the EMR-742 brief) over a
// feature flag because:
//   - The contract is what changes, not the wiring. The call site is
//     `requireRecentMfa({ purpose: "impersonation" })`; the wiring is
//     correct from day one.
//   - A feature flag defaulting off would be a footgun: if EMR-725
//     lands and someone forgets to flip the flag, impersonation would
//     silently skip MFA forever.
//
// Contract (frozen for EMR-725 to implement against):
//   - Returns `{ ok: true }` when the caller has completed an MFA
//     challenge within the trailing 5 minutes for the given `purpose`.
//   - Returns `{ ok: false, reason: "..." }` otherwise, with a stable
//     machine-readable reason ("no_mfa_enrolled" | "mfa_stale" |
//     "mfa_required" | "mfa_failed_attempt").
//   - Throws ONLY for infrastructure failures (Clerk down, etc.), not
//     for policy denials — denials are returned in the union.
//
// Callers in EMR-742:
//   - POST /api/admin/impersonate/[practiceId] — must verify before
//     issuing the impersonation cookie.

import "server-only";

import type { AuthedUser } from "./session";

export interface RequireRecentMfaOptions {
  /**
   * Why MFA is being requested. Forwarded into the Clerk step-up flow
   * so the UI can render a contextual prompt ("Confirm MFA to view as
   * Tahoe Pain Clinic"). Also used by EMR-725 for per-purpose grace
   * windows (e.g. a fresh MFA for "impersonation" doesn't satisfy a
   * later "delete_org" request).
   */
  purpose:
    | "impersonation"
    | "delete_org"
    | "bootstrap_grant"
    | "secret_rotation";
}

export type RequireRecentMfaResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "no_mfa_enrolled"
        | "mfa_stale"
        | "mfa_required"
        | "mfa_failed_attempt";
    };

/**
 * Stub. EMR-725 will replace this body. Until then we conservatively
 * return ok-true (matches the pre-EMR-725 baseline behavior — every
 * other super-admin write surface is currently MFA-not-required).
 *
 * IMPORTANT: when EMR-725 lands, this function MUST stop returning
 * ok-true unconditionally. The impersonation route in EMR-742 already
 * surfaces `{ error: "mfa_required" }` to the client, so the UI will
 * pick up the new denial response without any client changes.
 */
// SAFE: dead-export-allowed reason="EMR-725 will fill in; importer is the impersonation route created in same PR"
export async function requireRecentMfa(
  _user: AuthedUser,
  _options: RequireRecentMfaOptions,
): Promise<RequireRecentMfaResult> {
  // EMR-725 STUB. Returns ok-true until the real Clerk step-up check
  // lands. Do not relax this when EMR-725 ships — replace the body in
  // place so the impersonation route inherits the enforcement
  // automatically.
  return { ok: true };
}
