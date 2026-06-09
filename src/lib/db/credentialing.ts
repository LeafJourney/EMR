// EMR-625/627/628/629 — provider credentialing accessors (server-side).
//
// Pure expiration/recredential logic is re-exported from ./credentialing-logic;
// this module is the DB layer used by the credentialing API and the
// credential-check cron.

import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  type CredentialAlert,
  collectCredentialAlerts,
} from "./credentialing-logic";

export * from "./credentialing-logic";

/** Full credential profile for one provider, with its verification rows. */
export async function getProviderCredential(providerId: string) {
  return prisma.providerCredential.findUnique({
    where: { providerId },
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  });
}

/** Credential roster for an org (most-recently-touched first). */
export async function listOrgCredentials(organizationId: string) {
  return prisma.providerCredential.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
  });
}

export interface UpsertProviderCredentialInput {
  organizationId: string;
  providerId: string;
  npi?: string | null;
  deaNumber?: string | null;
  deaExpiresAt?: Date | null;
  licenseNumber?: string | null;
  licenseState?: string | null;
  licenseExpiresAt?: Date | null;
  malpracticeCarrier?: string | null;
  malpracticeExpiresAt?: Date | null;
  boardCertification?: string | null;
  boardCertExpiresAt?: Date | null;
  caqhId?: string | null;
  credentialedAt?: Date | null;
  nextRecredentialAt?: Date | null;
  notes?: string | null;
}

/** Create or update a provider's credential profile (one row per provider). */
export async function upsertProviderCredential(input: UpsertProviderCredentialInput) {
  const { organizationId, providerId, ...rest } = input;
  return prisma.providerCredential.upsert({
    where: { providerId },
    update: { ...rest },
    create: { organizationId, providerId, ...rest },
  });
}

export interface CredentialAlertGroup {
  providerId: string;
  organizationId: string;
  status: string;
  alerts: CredentialAlert[];
}

/**
 * Scan credential profiles for expiring/expired documents + due re-credentialing.
 * Returns only the profiles that have at least one alert. Used by the cron
 * (EMR-627/629) and the admin dashboard.
 */
export async function scanCredentialAlerts(opts: {
  organizationId?: string;
  now: Date;
  windowDays?: number;
}): Promise<CredentialAlertGroup[]> {
  const credentials = await prisma.providerCredential.findMany({
    where: opts.organizationId ? { organizationId: opts.organizationId } : {},
    select: {
      providerId: true,
      organizationId: true,
      status: true,
      deaExpiresAt: true,
      licenseExpiresAt: true,
      malpracticeExpiresAt: true,
      boardCertExpiresAt: true,
      nextRecredentialAt: true,
    },
  });

  const groups: CredentialAlertGroup[] = [];
  for (const c of credentials) {
    const alerts = collectCredentialAlerts(c, opts.now, opts.windowDays ?? 60);
    if (alerts.length > 0) {
      groups.push({
        providerId: c.providerId,
        organizationId: c.organizationId,
        status: c.status,
        alerts,
      });
    }
  }
  return groups;
}

/** Active (unresolved) OIG/SAM/license exclusion hits for an org. */
export async function listActiveExclusions(organizationId: string) {
  return prisma.providerExclusion.findMany({
    where: { organizationId, status: "active" },
    orderBy: { createdAt: "desc" },
  });
}

/** Payer enrollments for an org, optionally scoped to one provider. */
export async function listPayerEnrollments(
  organizationId: string,
  providerId?: string,
) {
  return prisma.payerEnrollment.findMany({
    where: { organizationId, ...(providerId ? { providerId } : {}) },
    orderBy: [{ providerId: "asc" }, { payerKey: "asc" }],
  });
}
