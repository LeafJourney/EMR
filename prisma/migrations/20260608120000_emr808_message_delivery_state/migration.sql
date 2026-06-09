-- EMR-808 — Messaging & correspondence: stop fake sends, fix state transitions.
-- Adds a truthful, durable delivery state + transport channel to Message, and a
-- real resolve column to MessageThread (replacing the in-body RESOLVED_SENTINEL
-- hack). Everything is additive + idempotent so it also applies cleanly over a
-- db-push-drifted dev DB.

-- Enums (guarded — CREATE TYPE has no IF NOT EXISTS).
DO $$ BEGIN
  CREATE TYPE "MessageChannel" AS ENUM ('portal', 'email', 'sms', 'fax', 'phone');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "MessageDelivery" AS ENUM ('recorded', 'delivered', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Message: channel + truthful delivery state.
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "channel" "MessageChannel" NOT NULL DEFAULT 'portal';
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "delivery" "MessageDelivery" NOT NULL DEFAULT 'recorded';
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deliveryDetail" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "recipient" TEXT;

-- MessageThread: durable resolve state.
ALTER TABLE "MessageThread" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
ALTER TABLE "MessageThread" ADD COLUMN IF NOT EXISTS "resolvedById" TEXT;

-- Backfill: every existing persisted message is a delivered in-app portal message.
UPDATE "Message" SET "delivery" = 'delivered'
  WHERE "status" IN ('sent', 'read') AND "delivery" = 'recorded';

-- Backfill: threads marked resolved via the legacy [[RESOLVED]] sentinel get a
-- real resolvedAt from the latest sentinel bubble's createdAt. The runtime
-- "is resolved" check is `resolvedAt >= lastMessageAt`, so threads a patient has
-- since replied to (lastMessageAt newer) correctly read as re-opened.
UPDATE "MessageThread" t
SET "resolvedAt" = sub."createdAt"
FROM (
  SELECT DISTINCT ON ("threadId") "threadId", "createdAt"
  FROM "Message"
  WHERE "body" LIKE '[[RESOLVED]]%'
  ORDER BY "threadId", "createdAt" DESC
) sub
WHERE t."id" = sub."threadId" AND t."resolvedAt" IS NULL;
