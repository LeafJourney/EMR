-- EMR-915 — scoped non-Clerk "lobby" session for the kiosk→phone hand-off.
-- Mirrors VendorSession: opaque token in cookie, SHA-256 hash stored here.
CREATE TABLE IF NOT EXISTS "KioskLobbySession" (
  "id"               TEXT NOT NULL,
  "patientId"        TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "sessionTokenHash" TEXT NOT NULL,
  "expiresAt"        TIMESTAMP(3) NOT NULL,
  "ipAddress"        TEXT,
  "userAgent"        TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KioskLobbySession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "KioskLobbySession_sessionTokenHash_key" ON "KioskLobbySession"("sessionTokenHash");
CREATE INDEX IF NOT EXISTS "KioskLobbySession_patientId_idx" ON "KioskLobbySession"("patientId");
CREATE INDEX IF NOT EXISTS "KioskLobbySession_expiresAt_idx" ON "KioskLobbySession"("expiresAt");
