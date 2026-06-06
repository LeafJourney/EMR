-- EMR-409 / EMR-418 — new PracticeConfiguration columns.
ALTER TABLE "PracticeConfiguration" ADD COLUMN "regulatoryProfileId" TEXT;
ALTER TABLE "PracticeConfiguration" ADD COLUMN "currentStep" INTEGER;

-- EMR-409 — controller dashboard "drafts in progress" sort.
CREATE INDEX "PracticeConfiguration_status_updatedAt_idx"
  ON "PracticeConfiguration"("status", "updatedAt");

-- EMR-436 — at most one published config per practice.
-- Collapse any pre-existing duplicate published configs (keep the most recently
-- published) so the partial unique index can be created safely on live data.
UPDATE "PracticeConfiguration"
SET "status" = 'archived'
WHERE "status" = 'published'
  AND "id" NOT IN (
    SELECT DISTINCT ON ("practiceId") "id"
    FROM "PracticeConfiguration"
    WHERE "status" = 'published'
    ORDER BY "practiceId", "publishedAt" DESC NULLS LAST, "updatedAt" DESC
  );

CREATE UNIQUE INDEX "PracticeConfiguration_one_published_per_practice"
  ON "PracticeConfiguration"("practiceId")
  WHERE "status" = 'published';
