-- Phase 1 — per-account AI markup knob.
-- The customer's price = reference token cost × this multiplier (floored).
-- Set at account setup; null falls back to the platform default (2× keystone),
-- resolved in code via resolveMarkupPolicy().
ALTER TABLE "PracticeSubscription" ADD COLUMN "aiMarkupMultiplier" DOUBLE PRECISION;
