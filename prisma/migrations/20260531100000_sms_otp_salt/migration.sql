-- EMR-916 — per-code salt for SMS OTPs (defeats offline rainbow tables of the
-- 6-digit space). Nullable + additive; legacy unsalted rows still verify.
ALTER TABLE "SmsOtpCode" ADD COLUMN IF NOT EXISTS "salt" TEXT;
