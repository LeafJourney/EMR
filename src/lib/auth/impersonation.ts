// EMR-742 — "View as practice" impersonation: signed-cookie session helpers.
//
// This is the single most security-sensitive surface in the product. A
// super-admin uses this to *temporarily* assume the view of a specific
// practice's clinical admin so support can reproduce customer-reported
// issues without phoning a clinician for a screenshare. It is read-only
// at the API layer (see api-gate.ts) and is *additive* to the underlying
// Clerk session — the impersonator's super-admin identity continues to be
// the source of truth for audit attribution.
//
// Threat model & design choices:
//
//   1. HMAC-signed cookie, never a server-side row. The cookie is the
//      only artifact of impersonation state; there is no DB table the
//      session lives in. This keeps revocation cheap (clear the cookie)
//      and removes a class of "stale impersonation in some db row"
//      bugs. The signature uses SESSION_SECRET — the same secret as
//      share-tokens.ts — so rotating the secret invalidates every
//      live impersonation immediately. Tampering is impossible without
//      the secret because the cookie value is the entire payload
//      verbatim plus an HMAC.
//
//   2. Cookie attributes: HttpOnly, Secure, SameSite=Lax, Path=/. JS
//      cannot read it; cross-origin POSTs cannot forge it (SameSite=Lax
//      blocks fetch credentials from off-origin); HTTPS-only in prod so
//      an attacker on the wire can't lift it.
//
//   3. Scoped to the super-admin user id. The cookie payload binds
//      `impersonatorUserId` into the signature. On every request we
//      verify the bound user matches the Clerk-authenticated user; if
//      the cookie is copied to another browser session with a different
//      Clerk identity, verification fails and the cookie is ignored.
//      (We do NOT clear it server-side on mismatch — clearing requires
//      a Set-Cookie response, which we can't reliably produce from
//      every read path. Mismatch == ignored is sufficient.)
//
//   4. Time-bounded. `expiresAt` is in the signed payload, AND the
//      cookie's Max-Age matches. Either check failing is enough to
//      treat the session as expired. 30 minute ceiling per acceptance
//      criteria — short enough that a forgotten session can't sit open
//      overnight; long enough for a support call.
//
//   5. Background jobs / webhooks must NOT inherit this context. The
//      cookie-based design naturally prevents that — cron handlers and
//      webhook routes don't receive a browser cookie jar — but we also
//      gate `readImpersonationFromCookies()` on `cookies()` from
//      next/headers, which throws outside a request scope. Defense in
//      depth against a future code path that tries to short-circuit the
//      check from a server-side worker.

import "server-only";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

/** Cookie name. Prefix is conventional for "this is a session-scoped cookie." */
export const IMPERSONATION_COOKIE = "lj_impersonation";

/** Max lifetime for an impersonation session, in milliseconds. */
export const IMPERSONATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Max lifetime in seconds — what we hand to the cookie jar. */
export const IMPERSONATION_TTL_SEC = Math.floor(IMPERSONATION_TTL_MS / 1000);

/** Cookie-jar attributes. Centralised so enter + exit + clear agree. */
const COOKIE_ATTRS = {
  httpOnly: true,
  // In dev (NODE_ENV !== production) we leave Secure off so localhost
  // works without HTTPS. In every other environment Secure is mandatory.
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/**
 * Resolve the HMAC secret. Mirrors share-tokens.ts so rotating
 * SESSION_SECRET invalidates both surfaces in lockstep.
 */
function getSecret(): string {
  return process.env.SESSION_SECRET ?? "dev-secret-replace-in-production";
}

function hmac(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("hex");
}

/** Constant-time compare so attackers can't time-leak the signature. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/** Shape of a verified impersonation session. */
export interface ImpersonationSession {
  /** Clerk user id of the super-admin who initiated impersonation. */
  impersonatorUserId: string;
  /** Organization id of the practice being impersonated. */
  practiceOrgId: string;
  /** Human-readable name of the practice, captured at enter time. */
  practiceName: string;
  /** Unix ms when impersonation began. */
  startedAt: number;
  /** Unix ms when impersonation auto-expires. */
  expiresAt: number;
}

/**
 * Build the signed cookie value for an impersonation session.
 *
 * Payload format: `v1.<base64url(json)>.<hex-sig>`
 *
 * We version-prefix so we can rotate the payload shape in a later
 * ticket without silently treating old cookies as valid (a v2 reader
 * sees `v1.` and rejects). Verbose but cheap insurance.
 */
export function signImpersonationCookie(session: ImpersonationSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const sig = hmac(`v1.${payload}`);
  return `v1.${payload}.${sig}`;
}

/**
 * Verify a raw cookie value and return the session, or null if the
 * cookie is missing/malformed/tampered/expired.
 *
 * `boundUserId` is the Clerk user id the *current* request is
 * authenticated as. We require it to match `impersonatorUserId` in the
 * signed payload — without this check, a leaked cookie could be
 * replayed in another browser session.
 */
export function verifyImpersonationCookie(
  raw: string | undefined,
  boundUserId: string,
): ImpersonationSession | null {
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [version, payloadB64, sig] = parts;
  if (version !== "v1") return null;
  if (!payloadB64 || !sig) return null;

  const expectedSig = hmac(`v1.${payloadB64}`);
  if (!safeEqual(sig, expectedSig)) return null;

  let parsed: unknown;
  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!isImpersonationSession(parsed)) return null;
  if (parsed.impersonatorUserId !== boundUserId) return null;
  if (parsed.expiresAt <= Date.now()) return null;

  return parsed;
}

function isImpersonationSession(v: unknown): v is ImpersonationSession {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.impersonatorUserId === "string" &&
    typeof r.practiceOrgId === "string" &&
    typeof r.practiceName === "string" &&
    typeof r.startedAt === "number" &&
    typeof r.expiresAt === "number"
  );
}

/**
 * Read + verify the impersonation session from the current request's
 * cookie jar. Returns null when no active session is present.
 *
 * Throws if called outside a Next.js request scope (cookies() throws).
 * That throw is *intentional* — it prevents background jobs/webhooks
 * from accidentally inheriting an impersonation context.
 */
export async function readImpersonationFromCookies(
  boundUserId: string,
): Promise<ImpersonationSession | null> {
  const jar = await cookies();
  const raw = jar.get(IMPERSONATION_COOKIE)?.value;
  return verifyImpersonationCookie(raw, boundUserId);
}

/**
 * Write the impersonation cookie. Server-action / route-handler only.
 */
export async function setImpersonationCookie(
  session: ImpersonationSession,
): Promise<void> {
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE, signImpersonationCookie(session), {
    ...COOKIE_ATTRS,
    maxAge: Math.max(
      0,
      Math.floor((session.expiresAt - Date.now()) / 1000),
    ),
  });
}

/**
 * Clear the impersonation cookie. Used by the exit route AND by any
 * code path that detects an expired/invalid cookie and wants to tell
 * the browser to discard it.
 */
export async function clearImpersonationCookie(): Promise<void> {
  const jar = await cookies();
  // Setting Max-Age=0 with the same Path is the only reliable way to
  // delete a cookie cross-browser; .delete() in some Next versions
  // emits the wrong Path attribute.
  jar.set(IMPERSONATION_COOKIE, "", {
    ...COOKIE_ATTRS,
    maxAge: 0,
  });
}
