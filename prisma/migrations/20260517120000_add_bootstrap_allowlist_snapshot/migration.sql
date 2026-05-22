-- EMR-726 — Bootstrap allowlist rotation audit.
--
-- One row per observed *change* of SUPER_ADMIN_BOOTSTRAP_EMAILS. The
-- boot-audit helper in src/lib/auth/bootstrap-audit.ts computes a
-- SHA-256 over the sorted/normalised allowlist and only inserts a new
-- row when the hash differs from the most recent snapshot.
--
-- Additive only — no existing table is touched.

CREATE TABLE "BootstrapAllowlistSnapshot" (
  "id"        TEXT PRIMARY KEY,
  "hash"      TEXT NOT NULL,
  "emails"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "deploySha" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "BootstrapAllowlistSnapshot_createdAt_idx"
  ON "BootstrapAllowlistSnapshot" ("createdAt" DESC);
