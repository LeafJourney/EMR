-- EMR-725 — Super-admin MFA enforcement: 14-day grace window for existing
-- super-admins who lack an enrolled second factor. Additive column on
-- Membership; null = no grace started (either MFA enrolled or non-super_admin).
ALTER TABLE "Membership" ADD COLUMN "mfaGraceUntil" TIMESTAMP(3);
