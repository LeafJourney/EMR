-- EMR-054 — live Garmin integration: encrypted OAuth tokens + webhook mapping.
--
-- Extends DeviceConnection so a real (non-mock) Garmin connection can store
-- its OAuth 1.0a access token + secret (encrypted at rest), the provider-side
-- user id used to route inbound webhook pushes back to the patient, token
-- expiry, granted scopes, the connection mode (live | mock), and transient
-- OAuth handshake state.
--
-- Additive + idempotent (ADD COLUMN IF NOT EXISTS), so it applies cleanly over
-- a db-push-drifted database — same posture as 20260613221500.

ALTER TABLE "DeviceConnection" ADD COLUMN IF NOT EXISTS "accessTokenSecret" TEXT;
ALTER TABLE "DeviceConnection" ADD COLUMN IF NOT EXISTS "tokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "DeviceConnection" ADD COLUMN IF NOT EXISTS "providerUserId" TEXT;
ALTER TABLE "DeviceConnection" ADD COLUMN IF NOT EXISTS "scopes" TEXT;
ALTER TABLE "DeviceConnection" ADD COLUMN IF NOT EXISTS "mode" TEXT;
ALTER TABLE "DeviceConnection" ADD COLUMN IF NOT EXISTS "oauthState" TEXT;

-- Webhook lookups resolve an inbound Garmin userId to its connection.
CREATE INDEX IF NOT EXISTS "DeviceConnection_provider_providerUserId_idx"
    ON "DeviceConnection"("provider", "providerUserId");
