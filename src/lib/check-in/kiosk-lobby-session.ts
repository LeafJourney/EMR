// EMR-915 — scoped "lobby" session for the kiosk→phone hand-off.
//
// Minted only after a patient clears the hand-off challenge (valid handoff
// token + SMS OTP) on their phone. Deliberately distinct from both the clinical
// Clerk session and the vendor session:
//   1. Different cookie name (`kiosk_lobby_session`)
//   2. Different cookie path (`/kiosk/lobby`) so the browser NEVER sends it to
//      clinical/portal/api routes — a lobby cookie can't ride along to PHI.
//   3. Different table (`KioskLobbySession`), holding only patientId + org.
//
// This session is an *identity*, not an authorization: it says "this device is
// acting as patient X of org Y for pre-visit completion." It grants nothing on
// its own — the scoped completion surface (later slice) is what restricts which
// pages/actions a lobby session may reach, and it must NEVER expose chart /
// records / messages.
//
// Cookie holds a plaintext opaque token; DB stores its SHA-256. A DB leak alone
// can't impersonate. Mirrors vendor-auth/session.ts.

import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getLobbyReadinessView, type LobbyWorkflow } from "./lobby-scope";

export const KIOSK_LOBBY_COOKIE = "kiosk_lobby_session";
export const KIOSK_LOBBY_COOKIE_PATH = "/kiosk/lobby";
export const KIOSK_LOBBY_TTL_MINUTES = 30;

/** Scoped identity carried by a lobby session — NOT a user, NOT a role. */
export interface KioskLobbyIdentity {
  patientId: string;
  organizationId: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateLobbySessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** Pure: is a session past its expiry as of `now`? */
export function isLobbySessionExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export async function createKioskLobbySession(opts: {
  patientId: string;
  organizationId: string;
  ipAddress?: string;
  userAgent?: string;
  now?: Date;
}): Promise<{ token: string; expiresAt: Date }> {
  const now = opts.now ?? new Date();
  const token = generateLobbySessionToken();
  const expiresAt = new Date(now.getTime() + KIOSK_LOBBY_TTL_MINUTES * 60 * 1000);
  await prisma.kioskLobbySession.create({
    data: {
      patientId: opts.patientId,
      organizationId: opts.organizationId,
      sessionTokenHash: hashToken(token),
      expiresAt,
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
    },
  });
  return { token, expiresAt };
}

export async function setKioskLobbyCookie(token: string, expiresAt: Date): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(KIOSK_LOBBY_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: KIOSK_LOBBY_COOKIE_PATH,
    expires: expiresAt,
  });
}

export async function clearKioskLobbyCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(KIOSK_LOBBY_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: KIOSK_LOBBY_COOKIE_PATH,
    maxAge: 0,
  });
}

/**
 * Resolve the current lobby identity from the cookie, or null. Constant-time
 * hash check + expiry. Never returns anything beyond patientId + org.
 */
export async function getCurrentKioskLobby(now: Date = new Date()): Promise<KioskLobbyIdentity | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(KIOSK_LOBBY_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.kioskLobbySession.findUnique({
    where: { sessionTokenHash: hashToken(token) },
  });
  if (!session) return null;

  // Double-check the stored hash constant-time (defense vs a near-match bug).
  const expected = Buffer.from(session.sessionTokenHash, "hex");
  const actual = Buffer.from(hashToken(token), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  if (isLobbySessionExpired(session.expiresAt, now)) return null;

  return { patientId: session.patientId, organizationId: session.organizationId };
}

/** Throwing variant for route handlers. */
export async function requireKioskLobby(): Promise<KioskLobbyIdentity> {
  const identity = await getCurrentKioskLobby();
  if (!identity) throw new Error("KIOSK_LOBBY_UNAUTHORIZED");
  return identity;
}

export async function pruneExpiredKioskLobbySessions(now: Date = new Date()): Promise<number> {
  const result = await prisma.kioskLobbySession.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return result.count;
}

/**
 * Scoped guard for a lobby completion surface. Resolves the lobby identity AND
 * checks that `workflow` is currently in-scope (i.e. it's an outstanding task
 * for this patient's visit, per the canonical readiness). Returns null when the
 * session is missing/expired OR when the workflow is out of scope — the caller
 * (a server component) turns null into a 404/expired screen so the lobby can
 * NEVER reach a surface that wasn't prepared for this patient.
 *
 * Defined here (not in lobby-scope) so the route layer has one import for "who
 * is this + may they be here." Re-derives everything server-side; never trusts
 * a client-supplied patientId or workflow claim.
 */
export async function getLobbyScopeFor(
  workflow: LobbyWorkflow,
  now: Date = new Date(),
): Promise<KioskLobbyIdentity | null> {
  const identity = await getCurrentKioskLobby(now);
  if (!identity) return null;
  const view = await getLobbyReadinessView(identity.patientId, identity.organizationId, now);
  if (!view.allowed.includes(workflow)) return null;
  return identity;
}
