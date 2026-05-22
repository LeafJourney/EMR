-- EMR-730 — Per-actor mutation budget alarm ledger.
--
-- One row per (actor, alarm-fire). The cron at
-- /api/cron/mutation-budget-sweep reads the most-recent row per actor to
-- dedupe re-fires inside a 10-minute window.

CREATE TABLE "MutationBudgetAlarm" (
  "id"             TEXT PRIMARY KEY,
  "actorUserId"    TEXT NOT NULL,
  "firstSeenAt"    TIMESTAMP(3) NOT NULL,
  "lastAlertedAt"  TIMESTAMP(3) NOT NULL,
  "perMinAtAlert"  INTEGER NOT NULL,
  "per5MinAtAlert" INTEGER NOT NULL
);

CREATE INDEX "MutationBudgetAlarm_actorUserId_lastAlertedAt_idx"
  ON "MutationBudgetAlarm" ("actorUserId", "lastAlertedAt" DESC);
