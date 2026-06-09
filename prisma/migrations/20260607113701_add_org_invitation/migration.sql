-- CreateTable
CREATE TABLE "OrgInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvitation_token_key" ON "OrgInvitation"("token");

-- CreateIndex
CREATE INDEX "OrgInvitation_organizationId_status_idx" ON "OrgInvitation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrgInvitation_email_idx" ON "OrgInvitation"("email");

