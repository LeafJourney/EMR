// SAFE: dead-export-allowed reason="EMR-915 OTP primitive; kiosk-lobby route consumer is a later slice in the build sequence"
// EMR-915 — one-time SMS code issuance + verification for the kiosk→phone
// hand-off identity challenge.
//
// identity-challenge.ts VERIFIES a "DOB + SMS code" challenge but assumes the
// code was issued elsewhere. This is that elsewhere.
//
// Security shape (mirrors vendor-auth/session.ts):
//   - The numeric code is NEVER stored in plaintext — only its SHA-256 hash —
//     and only ever leaves the server over SMS.
//   - Single active code per (patient, purpose): issuing a new one consumes any
//     prior unconsumed code.
//   - Bounded attempts + short expiry; constant-time comparison on verify.
//   - Issuance is rate-limited per (patient, purpose).
//
// The pure decision helpers below carry the security-critical logic and are
// unit-tested; the DB/SMS orchestration is a thin binding (untested by unit
// tests, same convention as loadPrevisitSnapshot).

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getSmsAdapter, normalizePhone } from "@/lib/sms/adapter";

const CODE_LENGTH = 6;
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_MAX_ATTEMPTS = 5;
/** Max codes that may be issued for one (patient, purpose) within the window. */
const ISSUE_RATE_MAX = 3;
const ISSUE_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export type OtpPurpose = "kiosk_lobby_handoff";

// ── Pure helpers (security-critical; unit-tested) ──────────────────────────

/** A cryptographically-random zero-padded numeric code. */
export function generateOtpCode(length: number = CODE_LENGTH): string {
  const max = 10 ** length;
  return String(randomInt(0, max)).padStart(length, "0");
}

/**
 * Hash an OTP for storage/comparison. A per-code random `salt` defeats offline
 * rainbow tables of the 6-digit space if the table is ever exposed. `salt` is
 * optional for backward-compat: legacy rows stored before salting (salt=null)
 * still verify via the plain digest.
 */
export function hashOtp(code: string, salt?: string | null): string {
  const material = salt ? `${salt}:${code.trim()}` : code.trim();
  return createHash("sha256").update(material).digest("hex");
}

/** Constant-time hash comparison; rejects empty/length-mismatched inputs. */
export function hashesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export type OtpVerifyReason =
  | "ok"
  | "no_active_code"
  | "expired"
  | "already_consumed"
  | "too_many_attempts"
  | "locked_out"
  | "mismatch";

export interface OtpRecordState {
  codeHash: string;
  /** Per-code random salt; null for legacy unsalted rows. */
  salt: string | null;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  consumedAt: Date | null;
}

/** Failed-attempt ceiling per (patient, purpose) ACROSS codes, within the window. */
const CROSS_CODE_MAX_FAILED = 10;
const CROSS_CODE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Pure: is the (patient, purpose) locked out from the aggregate of failed
 * attempts across all recent codes? Stops the "request many codes, one guess
 * each" vector that a per-code limit alone doesn't bound.
 */
export function isCrossCodeLocked(
  recentFailedAttempts: number,
  max: number = CROSS_CODE_MAX_FAILED,
): boolean {
  return recentFailedAttempts >= max;
}

/**
 * Pure verification decision. Given the stored record state and an attempt,
 * decide the outcome. Order matters: a consumed/expired/locked code fails
 * before we ever compare hashes (no oracle, no wasted compare).
 */
export function evaluateOtpVerification(
  record: OtpRecordState | null,
  attemptCode: string,
  now: Date,
): { ok: boolean; reason: OtpVerifyReason } {
  if (!record) return { ok: false, reason: "no_active_code" };
  if (record.consumedAt) return { ok: false, reason: "already_consumed" };
  if (record.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  // The attempt about to be made would be attempts+1; block once we'd exceed.
  if (record.attempts >= record.maxAttempts) {
    return { ok: false, reason: "too_many_attempts" };
  }
  if (!hashesEqual(hashOtp(attemptCode, record.salt), record.codeHash)) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, reason: "ok" };
}

/** Pure rate-limit decision for issuance. */
export function isIssueRateLimited(
  recentCount: number,
  max: number = ISSUE_RATE_MAX,
): boolean {
  return recentCount >= max;
}

// ── DB / SMS orchestration (thin binding) ──────────────────────────────────

export interface IssueOtpResult {
  ok: boolean;
  reason?: "rate_limited" | "no_phone" | "sms_failed";
  expiresAt?: Date;
}

/**
 * Issue a fresh code: rate-limit, consume any prior active code, store the hash,
 * and send the plaintext over SMS. The code is never returned to the caller.
 */
export async function issueOtpCode(opts: {
  patientId: string;
  organizationId: string;
  purpose: OtpPurpose;
  phone: string | null;
  now?: Date;
  ttlMs?: number;
}): Promise<IssueOtpResult> {
  const now = opts.now ?? new Date();
  const to = normalizePhone(opts.phone);
  if (!to) return { ok: false, reason: "no_phone" };

  const recentCount = await prisma.smsOtpCode.count({
    where: {
      patientId: opts.patientId,
      purpose: opts.purpose,
      createdAt: { gt: new Date(now.getTime() - ISSUE_RATE_WINDOW_MS) },
    },
  });
  if (isIssueRateLimited(recentCount)) {
    await audit(opts.organizationId, opts.patientId, "otp.issue.rate_limited", opts.purpose);
    return { ok: false, reason: "rate_limited" };
  }

  // Single active code per (patient, purpose): retire any unconsumed ones.
  await prisma.smsOtpCode.updateMany({
    where: { patientId: opts.patientId, purpose: opts.purpose, consumedAt: null },
    data: { consumedAt: now },
  });

  const code = generateOtpCode();
  const salt = randomBytes(16).toString("hex");
  const expiresAt = new Date(now.getTime() + (opts.ttlMs ?? DEFAULT_TTL_MS));
  await prisma.smsOtpCode.create({
    data: {
      patientId: opts.patientId,
      purpose: opts.purpose,
      codeHash: hashOtp(code, salt),
      salt,
      expiresAt,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    },
  });

  const sent = await getSmsAdapter().send({
    to,
    body: `Your check-in code is ${code}. It expires in 10 minutes.`,
    context: { patientId: opts.patientId, purpose: opts.purpose },
  });
  if (!sent.ok) {
    await audit(opts.organizationId, opts.patientId, "otp.issue.sms_failed", opts.purpose);
    return { ok: false, reason: "sms_failed" };
  }

  await audit(opts.organizationId, opts.patientId, "otp.issued", opts.purpose);
  return { ok: true, expiresAt };
}

/**
 * Verify an attempt against the latest active code. The attempt counter is the
 * ONLY brute-force bound on the 6-digit code (issuance rate-limiting caps how
 * many codes are minted, not how many guesses are made), so it MUST be spent
 * atomically: a read-then-write increment lets N concurrent guesses all observe
 * the same pre-increment `attempts` and sail past `maxAttempts` together.
 *
 * We spend the budget with a single conditional `updateMany` guarded on
 * `attempts < maxAttempts` (the same atomic-claim pattern as the hand-off token
 * consume). Only a request that wins a slot may compare the hash; the compare
 * therefore happens at most `maxAttempts` times across all concurrent callers.
 * Consume-on-success is likewise a conditional update so two correct guesses
 * can't both consume.
 */
export async function verifyOtpCode(opts: {
  patientId: string;
  organizationId: string;
  purpose: OtpPurpose;
  attemptCode: string;
  now?: Date;
}): Promise<{ ok: boolean; reason: OtpVerifyReason }> {
  const now = opts.now ?? new Date();

  // Cross-code lockout: aggregate failed attempts across ALL recent codes for
  // this (patient, purpose). Bounds the "request many codes, one guess each"
  // vector that the per-code attempt cap can't see.
  const recentFailed = await prisma.smsOtpCode.aggregate({
    where: {
      patientId: opts.patientId,
      purpose: opts.purpose,
      createdAt: { gt: new Date(now.getTime() - CROSS_CODE_WINDOW_MS) },
    },
    _sum: { attempts: true },
  });
  if (isCrossCodeLocked(recentFailed._sum.attempts ?? 0)) {
    await audit(opts.organizationId, opts.patientId, "otp.verified_failed", opts.purpose, "locked_out");
    return { ok: false, reason: "locked_out" };
  }

  const record = await prisma.smsOtpCode.findFirst({
    where: { patientId: opts.patientId, purpose: opts.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  // Decisions that must NOT spend an attempt (no record / expired / already
  // consumed) are settled purely up front — exactly the prior behaviour.
  if (!record) {
    return finishVerify(opts, now, { ok: false, reason: "no_active_code" });
  }
  const snapshot = {
    codeHash: record.codeHash,
    salt: record.salt,
    expiresAt: record.expiresAt,
    attempts: record.attempts,
    maxAttempts: record.maxAttempts,
    consumedAt: record.consumedAt,
  };
  const pre = evaluateOtpVerification(snapshot, opts.attemptCode, now);
  if (
    pre.reason === "no_active_code" ||
    pre.reason === "expired" ||
    pre.reason === "already_consumed"
  ) {
    return finishVerify(opts, now, pre);
  }

  // A real guess (ok / mismatch / lockout). Atomically claim one attempt slot:
  // increments ONLY while the code is unconsumed, unexpired, and under budget.
  // `maxAttempts` is immutable post-issuance, so the snapshot value is a safe
  // literal bound. count === 0 ⇒ we lost the race / the budget is spent.
  const claim = await prisma.smsOtpCode.updateMany({
    where: {
      id: record.id,
      consumedAt: null,
      expiresAt: { gt: now },
      attempts: { lt: record.maxAttempts },
    },
    data: { attempts: { increment: 1 } },
  });
  if (claim.count === 0) {
    return finishVerify(opts, now, { ok: false, reason: "too_many_attempts" });
  }

  // We hold a counted attempt. Compare the hash off the snapshot (the codeHash
  // is immutable for the life of the code).
  if (!hashesEqual(hashOtp(opts.attemptCode, snapshot.salt), snapshot.codeHash)) {
    return finishVerify(opts, now, { ok: false, reason: "mismatch" });
  }

  // Correct code: consume atomically so a concurrent correct guess can't also
  // win. Losing this race means someone else already consumed it.
  const consumed = await prisma.smsOtpCode.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (consumed.count === 0) {
    return finishVerify(opts, now, { ok: false, reason: "already_consumed" });
  }
  return finishVerify(opts, now, { ok: true, reason: "ok" });
}

/** Emit the PHI-free audit row for a verify outcome and return it. */
async function finishVerify(
  opts: { patientId: string; organizationId: string; purpose: OtpPurpose },
  _now: Date,
  decision: { ok: boolean; reason: OtpVerifyReason },
): Promise<{ ok: boolean; reason: OtpVerifyReason }> {
  await audit(
    opts.organizationId,
    opts.patientId,
    decision.ok ? "otp.verified_success" : "otp.verified_failed",
    opts.purpose,
    decision.ok ? undefined : decision.reason,
  );
  return decision;
}

async function audit(
  organizationId: string,
  patientId: string,
  action: string,
  purpose: string,
  reason?: string,
): Promise<void> {
  // PHI-free metadata only: purpose + (for failures) the machine reason. No code,
  // no phone, no patient identifiers beyond the opaque id in subjectId.
  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId: null,
      action,
      subjectType: "Patient",
      subjectId: patientId,
      metadata: reason ? { purpose, reason } : { purpose },
    },
  });
}
