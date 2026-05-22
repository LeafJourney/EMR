-- EMR-727 — Emergency revoke / fleet-wide session kill-list.
--
-- This table is the "shared kill-list" referenced in the ticket. Since the
-- EMR stack on Render has no Redis (see package.json; only @prisma/client +
-- pg are present), Postgres IS the shared store across replicas — every
-- replica points at the same DATABASE_URL, so a row inserted here is
-- immediately visible to every other replica.
--
-- The auth gate consults this table on every authenticated request via a
-- tiny in-process TTL cache (≤1s) in `src/lib/auth/session-kill-list.ts`.
-- That bounds end-to-end revoke-to-lockout propagation at ~one cache TTL
-- across the entire fleet — well inside the ≤1s SLO from the ticket — while
-- amortizing the DB hit to roughly one indexed PK lookup per (user, second)
-- in steady state.
--
-- The row carries an `expiresAt` that MUST exceed the longest possible
-- session lifetime so a kill cannot lapse before any surviving session
-- cookie/JWT does. The endpoint sets this to 90 days (≫ longest Clerk JWT
-- + cookie window) when emitting a kill.
--
-- The `id` PK is `userId` directly — there is at most one live kill per
-- user. A subsequent revoke UPSERTs, refreshing `revokedAt` + `expiresAt`.

CREATE TABLE "SessionKillList" (
  "userId"      TEXT PRIMARY KEY,
  "revokedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "reason"      TEXT NOT NULL,
  "revokedById" TEXT NOT NULL
);

-- Cron-friendly index for the eventual expired-row sweep. Lookups by
-- userId go through the PK so no extra index needed there.
CREATE INDEX "SessionKillList_expiresAt_idx"
  ON "SessionKillList" ("expiresAt");
