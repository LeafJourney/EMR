-- AlterTable: add per-org pre-visit portal URL override (EMR-916)
ALTER TABLE "Organization" ADD COLUMN "previsitPortalUrl" TEXT;
