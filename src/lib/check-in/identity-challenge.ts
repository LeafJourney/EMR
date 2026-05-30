// SAFE: dead-export-allowed reason="quarantined QR rescue helper awaiting route wiring"
// Day-of check-in identity challenge.
//
// Older adults shouldn't have to fight portal login in the lobby, so the QR
// rescue path uses a minimal two-factor challenge instead:
//   - Preferred: DOB + a one-time SMS code (when a phone is on file AND a code
//     has been issued).
//   - Fallback: DOB + last name (front-desk assisted; no phone / no code).
//
// This gates ONLY the rescue check-in. Full chart / messages / labs / records
// still require real portal login. Pure + timing-safe; logs nothing.

import { timingSafeEqual } from "node:crypto";

export type ChallengeMode = "dob_sms" | "dob_lastname";

export interface IdentityExpectation {
  /** Expected DOB, ISO yyyy-mm-dd. */
  dateOfBirth: string;
  /** Expected last name. */
  lastName: string;
  /** Expected one-time SMS code, if one was issued. */
  smsCode: string | null;
  /** Whether a phone number is on file. */
  hasPhone: boolean;
}

export interface IdentityAttempt {
  dateOfBirth?: string;
  smsCode?: string;
  lastName?: string;
}

export interface IdentityResult {
  ok: boolean;
  mode: ChallengeMode;
}

export function chooseChallengeMode(exp: IdentityExpectation): ChallengeMode {
  return exp.hasPhone && exp.smsCode != null ? "dob_sms" : "dob_lastname";
}

function norm(s: string | undefined | null): string {
  return (s ?? "").trim().toLowerCase();
}

/** Constant-time-ish equality that also rejects empty expected/attempt values. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyCheckInIdentity(
  expectation: IdentityExpectation,
  attempt: IdentityAttempt,
): IdentityResult {
  const mode = chooseChallengeMode(expectation);

  // DOB is required in both modes.
  if (!safeEqual(norm(attempt.dateOfBirth), norm(expectation.dateOfBirth))) {
    return { ok: false, mode };
  }

  if (mode === "dob_sms") {
    // Must use the SMS code; last name is NOT accepted when a phone+code exist.
    const codeOk =
      expectation.smsCode != null &&
      safeEqual(norm(attempt.smsCode), norm(expectation.smsCode));
    return { ok: codeOk, mode };
  }

  // Fallback: DOB + last name.
  return { ok: safeEqual(norm(attempt.lastName), norm(expectation.lastName)), mode };
}
