-- EMR-751 — Per-organization billing subscription state.

CREATE TABLE "PracticeSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "monthlyRevenueCents" INTEGER NOT NULL DEFAULT 0,
    "seatLimit" INTEGER,
    "includedMonthlyTokens" INTEGER,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "throttled" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "overrideSetAt" TIMESTAMP(3),
    "overrideSetByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PracticeSubscription_organizationId_key"
    ON "PracticeSubscription"("organizationId");

CREATE UNIQUE INDEX "PracticeSubscription_stripeSubscriptionId_key"
    ON "PracticeSubscription"("stripeSubscriptionId");

CREATE INDEX "PracticeSubscription_status_idx"
    ON "PracticeSubscription"("status");

CREATE INDEX "PracticeSubscription_tier_idx"
    ON "PracticeSubscription"("tier");

ALTER TABLE "PracticeSubscription"
    ADD CONSTRAINT "PracticeSubscription_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
