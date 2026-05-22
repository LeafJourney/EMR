// EMR-727 — Fleet-wide session kill-list.
//
// Purpose: close the window between "super-admin clicks Emergency Revoke"
// and "the compromised account stops being able to do things." Historically
// that window was bounded by JWT / cookie lifetime (minutes to hours). This
// module brings it down to the next request after the revoke DB transaction
// commits — across every Render replica.
//
// Strategy (chosen because EMR has no Redis in package.json today):
//
//   1. A small Postgres table (`SessionKillList`) is the shared store.
//      Postgres is already replicated across every replica via DATABASE_URL,
//      so a row inserted by replica A is immediately visible from replica
//      B's connection pool.
//
//   2. Every authenticated request asks `isUserRevoked(userId)`. We layer
//      a 1-second in-process TTL cache over the DB query: on a cache MISS
//      we hit Postgres (single PK lookup, ~sub-millisecond on warm pool),
//      on a HIT we return the cached "is/isn't revoked" verdict.
//
//   3. The 1s TTL is the propagation bound. Worst case: replica B caches
//      "not revoked" at t=0, replica A revokes at t=0.001. Replica B will
//      serve stale "not revoked" until t=1.0 when its cache expires and it
//      re-reads the table. That's the ≤1s SLO from the ticket.
//
//   4. For the actor doing the revoke (and the target on the same replica)
//      we explicitly invalidate the cache after writing the row, so the
//      next request on that replica is immediate.
//
// Trade-off vs Redis: we save the infra dependency. We pay one indexed PK
// lookup per (userId, second) in steady state. Hot-path budget: ~1ms p99
// against a warm pool — within the <2ms p99 the ticket calls out, with
// headroom. If we later add Redis we can swap the implementation behind
// `isUserRevoked` without changing call sites.
//
// Audit / semantics:
//   - kill() upserts the row and bumps `revokedAt` if already present
//   - clear() removes the row (used in tests; not exposed via API)
//   - isUserRevoked() is the hot-path read every gate makes

import "server-only";

import { prisma } from "@/lib/db/prisma";

/**
 * Cache TTL. This is also the worst-case propagation latency for an
 * emergency-revoke across the fleet — keep it ≤1000ms per the EMR-727 SLO.
 */
const CACHE_TTL_MS = 1_000;

/**
 * Default expiry on a kill-list row, in milliseconds. Must exceed the
 * longest possible Clerk session / cookie window — 90 days is well past
 * any realistic JWT TTL and gives ops a long forensic window before the
 * sweep cron reclaims the row.
 */
export const KILL_LIST_TTL_MS = 90 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  revoked: boolean;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Test-only hook. Wipes the in-process cache so a test that mutates the
 * kill-list table sees its own writes on the next read.
 *
 * Not exported via index — call sites should be tests + the revoke
 * endpoint's post-write invalidation.
 */
export function _clearCacheForTests(): void {
  cache.clear();
}

/**
 * Drop the cached verdict for a single user. Call after writing or
 * deleting a kill-list row on this replica so the same-replica next
 * request is immediate (other replicas still respect the 1s TTL bound).
 */
export function invalidateLocalCache(userId: string): void {
  cache.delete(userId);
}

/**
 * Hot-path predicate: is this user currently in the kill-list?
 *
 * Returns true when a non-expired row exists. Cached for CACHE_TTL_MS
 * so steady-state cost is a single in-memory Map.get() per request.
 */
export async function isUserRevoked(userId: string): Promise<boolean> {
  if (!userId) return false;

  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.revoked;
  }

  // Cache miss — consult Postgres. PK lookup, one row max.
  const row = await prisma.sessionKillList.findUnique({
    where: { userId },
    select: { expiresAt: true },
  });

  // A row is "live" iff it exists AND has not expired. Expired rows are
  // tombstones that the sweep cron will reclaim — they do not lock anyone
  // out (this also defends against an operator typo where expiresAt was
  // set to the past).
  const revoked = row !== null && row.expiresAt.getTime() > now;
  cache.set(userId, { revoked, fetchedAt: now });
  return revoked;
}

/**
 * Insert/refresh a kill-list row. Idempotent — calling kill() twice on
 * the same user just bumps `revokedAt` and `expiresAt`.
 *
 * Caller is responsible for the role/authorization check; this helper
 * only writes the row + invalidates the local cache.
 */
export async function kill(params: {
  userId: string;
  reason: string;
  revokedById: string;
  ttlMs?: number;
}): Promise<void> {
  const ttl = params.ttlMs ?? KILL_LIST_TTL_MS;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl);

  await prisma.sessionKillList.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      revokedAt: now,
      expiresAt,
      reason: params.reason,
      revokedById: params.revokedById,
    },
    update: {
      revokedAt: now,
      expiresAt,
      reason: params.reason,
      revokedById: params.revokedById,
    },
  });

  // Same-replica fast path — make the next request from this process see
  // the kill immediately rather than waiting out the TTL.
  invalidateLocalCache(params.userId);
}

/**
 * Remove a user from the kill-list. NOT exposed via API (we don't want a
 * "restore session" button — re-issuing access is a deliberate, audited
 * grant via the existing POST /api/admin/super-admins flow). Used only by
 * tests + future ops tooling.
 */
export async function clearKill(userId: string): Promise<void> {
  await prisma.sessionKillList.deleteMany({ where: { userId } });
  invalidateLocalCache(userId);
}
