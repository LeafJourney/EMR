// SAFE: dead-export-allowed reason="quarantined QR rescue helper awaiting route wiring"
// QR "rescue" check-in token.
//
// Day-of check-in path for patients (esp. older adults) who can't fight portal
// login in the lobby. Security contract:
//   - Appointment-scoped, short-lived, minimal.
//   - NO PHI in the token or the URL — payload is opaque ids + signature only.
//   - Signed (HMAC-SHA256) so a tampered/forged token is rejected offline.
//   - Persisted as a SHA-256 *hash* (never the raw token) so a DB leak can't
//     replay tokens; redemption matches the presented token's hash against the
//     stored hash.
//   - Redemption verifies: signature, expiry, appointment<->patient
//     relationship, appointment status, the check-in time window, and
//     single-use (not already redeemed).
//
// Pure/deterministic. The DB read (appointment row + stored hash + redeemedAt)
// is supplied by the caller via CheckInVerifyContext, so the public check-in
// route (Codex/app layer) owns the Prisma binding. This module never logs.

import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const CHECK_IN_PURPOSE = "qr_rescue" as const;

/** Default minutes before startAt that a QR check-in becomes valid. */
export const DEFAULT_EARLY_WINDOW_MINUTES = 60;
/** Default grace minutes after endAt during which a QR check-in still works. */
export const DEFAULT_LATE_GRACE_MINUTES = 30;

/** Default token lifetime if a caller wants a helper to compute expiry. */
export const DEFAULT_TOKEN_TTL_MINUTES = 180;

export interface CheckInTokenPayload {
  appointmentId: string;
  patientId: string;
  /** Expiry as epoch milliseconds. */
  exp: number;
  /** Opaque uniqueness so two appointments never collide / aren't guessable. */
  nonce: string;
  purpose: typeof CHECK_IN_PURPOSE;
}

export interface CreateCheckInTokenInput {
  appointmentId: string;
  patientId: string;
  expiresAt: Date;
  secret: string;
  nonce: string;
}

export interface CreatedCheckInToken {
  /** Opaque token to embed in the QR URL. */
  token: string;
  /** SHA-256 hash to persist (never store the raw token). */
  tokenHash: string;
  payload: CheckInTokenPayload;
  expiresAt: Date;
}

export interface CheckInAppointmentSnapshot {
  id: string;
  patientId: string;
  status: string;
  startAt: Date;
  endAt: Date | null;
}

export interface CheckInVerifyContext {
  secret: string;
  now: Date;
  appointment: CheckInAppointmentSnapshot;
  /** The hash persisted when the token was generated. */
  storedTokenHash: string;
  /** When the token was redeemed, if ever (single-use enforcement). */
  redeemedAt: Date | null;
  earlyWindowMinutes?: number;
  lateGraceMinutes?: number;
}

export type CheckInVerifyFailure =
  | "invalid_signature"
  | "unknown_token"
  | "relationship_mismatch"
  | "appointment_not_checkinable"
  | "already_redeemed"
  | "expired"
  | "outside_window";

export interface CheckInVerifyResult {
  valid: boolean;
  reason?: CheckInVerifyFailure;
  payload?: CheckInTokenPayload;
}

const CHECKINABLE_STATUSES = new Set(["requested", "confirmed"]);

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(body: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(body).digest());
}

function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hashCheckInToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createCheckInToken(
  input: CreateCheckInTokenInput,
): CreatedCheckInToken {
  const payload: CheckInTokenPayload = {
    appointmentId: input.appointmentId,
    patientId: input.patientId,
    exp: input.expiresAt.getTime(),
    nonce: input.nonce,
    purpose: CHECK_IN_PURPOSE,
  };

  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = sign(body, input.secret);
  const token = `${body}.${sig}`;

  return {
    token,
    tokenHash: hashCheckInToken(token),
    payload,
    expiresAt: input.expiresAt,
  };
}

/** Verify signature + structure. Returns the payload, or null if invalid. */
export function parseCheckInToken(
  token: string,
  secret: string,
): CheckInTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!safeEqualStr(sig, sign(body, secret))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  if (
    typeof p.appointmentId !== "string" ||
    typeof p.patientId !== "string" ||
    typeof p.exp !== "number" ||
    typeof p.nonce !== "string" ||
    p.purpose !== CHECK_IN_PURPOSE
  ) {
    return null;
  }

  return {
    appointmentId: p.appointmentId,
    patientId: p.patientId,
    exp: p.exp,
    nonce: p.nonce,
    purpose: CHECK_IN_PURPOSE,
  };
}

export function verifyCheckInToken(
  token: string,
  ctx: CheckInVerifyContext,
): CheckInVerifyResult {
  const payload = parseCheckInToken(token, ctx.secret);
  if (!payload) return { valid: false, reason: "invalid_signature" };

  // The presented token must hash to exactly what we persisted. A rotated or
  // revoked token (or a stale hash) is "unknown".
  if (!safeEqualStr(hashCheckInToken(token), ctx.storedTokenHash)) {
    return { valid: false, reason: "unknown_token", payload };
  }

  // The appointment<->patient relationship the token claims must match the row.
  if (
    payload.appointmentId !== ctx.appointment.id ||
    payload.patientId !== ctx.appointment.patientId
  ) {
    return { valid: false, reason: "relationship_mismatch", payload };
  }

  if (!CHECKINABLE_STATUSES.has(ctx.appointment.status)) {
    return { valid: false, reason: "appointment_not_checkinable", payload };
  }

  if (ctx.redeemedAt != null) {
    return { valid: false, reason: "already_redeemed", payload };
  }

  const nowMs = ctx.now.getTime();
  if (nowMs > payload.exp) {
    return { valid: false, reason: "expired", payload };
  }

  const earlyMs =
    (ctx.earlyWindowMinutes ?? DEFAULT_EARLY_WINDOW_MINUTES) * 60_000;
  const lateMs = (ctx.lateGraceMinutes ?? DEFAULT_LATE_GRACE_MINUTES) * 60_000;
  const windowOpens = ctx.appointment.startAt.getTime() - earlyMs;
  const windowCloses =
    (ctx.appointment.endAt ?? ctx.appointment.startAt).getTime() + lateMs;
  if (nowMs < windowOpens || nowMs > windowCloses) {
    return { valid: false, reason: "outside_window", payload };
  }

  return { valid: true, payload };
}
