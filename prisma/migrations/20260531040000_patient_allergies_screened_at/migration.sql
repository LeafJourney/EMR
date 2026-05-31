-- EMR-913 — explicit allergy-screening timestamp on Patient. Additive/nullable;
-- backfills as NULL (= never screened), which the pre-visit gate already treats
-- as unsatisfied. Replaces the brittle `allergies.length > 0` screening proxy.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "allergiesScreenedAt" TIMESTAMP(3);
