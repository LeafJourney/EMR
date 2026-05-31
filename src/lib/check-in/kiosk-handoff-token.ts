// SAFE: dead-export-allowed reason="EMR-915 hand-off token primitive; /kiosk/lobby route consumer is a later slice"
// EMR-915 — kiosk → phone hand-off token.
//
// Minted at the kiosk the moment a walk-in has been identified (name + DOB
// confirmed) and taps "Continue on my phone". Encoded as a QR the patient
// scans; their phone opens /kiosk/lobby/[token], which then runs the SMS-OTP
// identity challenge before any scoped session is minted.
//
// This is a sibling of qr-token.ts, NOT a reuse: that token is appointment-
// scoped with a visit time-window; this one is PATIENT + ORGANIZATION scoped
// with no appointment and no window (the kiosk already did the in-person
// identity step). Security contract is otherwise identical:
//   - NO PHI in the token or URL — opaque ids + signature only.
//   - HMAC-SHA256 signed, so a forged/tampered token is rejected offline.
//   - Persisted as a SHA-256 *hash* (never the raw token); single-use via a
//     caller-supplied redeemedAt.
//   - Short-lived (~10 min): it only has to survive the walk to a chair.
//
// Pure/deterministic. The DB read (stored hash + redeemedAt) is supplied by the
// caller via KioskHandoffVerifyContext, so the /kiosk/lobby route owns the
// Prisma binding. This module never logs.

import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const KIOSK_HANDOFF_PURPOSE = "kiosk_handoff" as const;

/** Default token lifetime — long enough to cross the lobby, short enough to be safe. */
export const DEFAULT_HANDOFF_TTL_MINUTES = 10;

export interface KioskHandoffPayload {
  patientId: string;
  organizationId: string;
  /** Expiry as epoch milliseconds. */
  exp: number;
  /** Opaque uniqueness so tokens aren't guessable / don't collide. */
  nonce: string;
  purpose: typeof KIOSK_HANDOFF_PURPOSE;
}

export interface CreateKioskHandoffTokenInput {
  patientId: string;
  organizationId: string;
  expiresAt: Date;
  secret: string;
  nonce: string;
}

export interface CreatedKioskHandoffToken {
  /** Opaque token to embed in the QR URL. */
  token: string;
  /** SHA-256 hash to persist (never store the raw token). */
  tokenHash: string;
  payload: KioskHandoffPayload;
  expiresAt: Date;
}

export interface KioskHandoffVerifyContext {
  secret: string;
  now: Date;
  /** The hash persisted when the token was minted. */
  storedTokenHash: string;
  /** When the token was redeemed, if ever (single-use enforcement). */
  redeemedAt: Date | null;
  /** Optional cross-checks against the row the stored hash was found on. */
  expectedPatientId?: string;
  expectedOrganizationId?: string;
}

export type KioskHandoffVerifyFailure =
  | "invalid_signature"
  | "unknown_token"
  | "relationship_mismatch"
  | "already_redeemed"
  | "expired";

export interface KioskHandoffVerifyResult {
  valid: boolean;
  reason?: KioskHandoffVerifyFailure;
  payload?: KioskHandoffPayload;
}

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

export function hashKioskHandoffToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createKioskHandoffToken(
  input: CreateKioskHandoffTokenInput,
): CreatedKioskHandoffToken {
  const payload: KioskHandoffPayload = {
    patientId: input.patientId,
    organizationId: input.organizationId,
    exp: input.expiresAt.getTime(),
    nonce: input.nonce,
    purpose: KIOSK_HANDOFF_PURPOSE,
  };

  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = sign(body, input.secret);
  const token = `${body}.${sig}`;

  return {
    token,
    tokenHash: hashKioskHandoffToken(token),
    payload,
    expiresAt: input.expiresAt,
  };
}

/** Verify signature + structure. Returns the payload, or null if invalid. */
export function parseKioskHandoffToken(
  token: string,
  secret: string,
): KioskHandoffPayload | null {
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
    typeof p.patientId !== "string" ||
    typeof p.organizationId !== "string" ||
    typeof p.exp !== "number" ||
    typeof p.nonce !== "string" ||
    p.purpose !== KIOSK_HANDOFF_PURPOSE
  ) {
    return null;
  }

  return {
    patientId: p.patientId,
    organizationId: p.organizationId,
    exp: p.exp,
    nonce: p.nonce,
    purpose: KIOSK_HANDOFF_PURPOSE,
  };
}

export function verifyKioskHandoffToken(
  token: string,
  ctx: KioskHandoffVerifyContext,
): KioskHandoffVerifyResult {
  const payload = parseKioskHandoffToken(token, ctx.secret);
  if (!payload) return { valid: false, reason: "invalid_signature" };

  // The presented token must hash to exactly what we persisted.
  if (!safeEqualStr(hashKioskHandoffToken(token), ctx.storedTokenHash)) {
    return { valid: false, reason: "unknown_token", payload };
  }

  // The patient/org the token claims must match the row it was found on.
  if (
    (ctx.expectedPatientId != null && payload.patientId !== ctx.expectedPatientId) ||
    (ctx.expectedOrganizationId != null &&
      payload.organizationId !== ctx.expectedOrganizationId)
  ) {
    return { valid: false, reason: "relationship_mismatch", payload };
  }

  if (ctx.redeemedAt != null) {
    return { valid: false, reason: "already_redeemed", payload };
  }

  if (ctx.now.getTime() > payload.exp) {
    return { valid: false, reason: "expired", payload };
  }

  return { valid: true, payload };
}
