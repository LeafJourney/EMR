-- CreateTable
CREATE TABLE "VendorApplication" (
    "id"           TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyName"  TEXT NOT NULL,
    "contactName"  TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "phone"        TEXT,
    "website"      TEXT,
    "productTypes" JSONB NOT NULL,
    "hasCoa"       TEXT NOT NULL,
    "description"  TEXT NOT NULL,
    "ip"           TEXT,

    CONSTRAINT "VendorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorApplication_email_idx" ON "VendorApplication"("email");

-- CreateIndex
CREATE INDEX "VendorApplication_createdAt_idx" ON "VendorApplication"("createdAt");
