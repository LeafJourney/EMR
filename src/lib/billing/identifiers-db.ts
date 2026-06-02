// EMR-220 — DB-backed billing identifier helpers
// ----------------------------------------------
// `identifiers.ts` stays pure. This file owns the Prisma round-trips so
// callers in the agent / server-action layer can ask "give me the
// resolved billing tuple for org+provider" with one call instead of
// re-implementing the read across every clearinghouse callsite.

import { prisma } from "@/lib/db/prisma";
import {
  isValidEin,
  isValidNpi,
  isValidTaxonomy,
  normalizeEin,
  resolveBillingIdentifiers,
  type ResolvedBillingIdentifiers,
} from "./identifiers";

// ---------------------------------------------------------------------------
// One-shot resolver
// ---------------------------------------------------------------------------

/** Load Organization + Provider rows and run the three-tier resolver in
 *  `identifiers.ts`. Throws when no valid billing NPI / address can be
 *  derived from any source — submission requires both. */
export async function resolveBillingIdentifiersForClaim(args: {
  organizationId: string;
  providerId?: string | null;
}): Promise<ResolvedBillingIdentifiers> {
  const [org, provider] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: args.organizationId },
      select: {
        id: true,
        billingNpi: true,
        taxId: true,
        billingAddress: true,
        payToAddress: true,
      },
    }),
    args.providerId
      ? prisma.provider.findUnique({
          where: { id: args.providerId },
          select: { id: true, npi: true, taxonomyCode: true, bio: true },
        })
      : Promise.resolve(null),
  ]);

  return resolveBillingIdentifiers({ organization: org, provider });
}

// ---------------------------------------------------------------------------
// Admin: identifier health snapshot
// ---------------------------------------------------------------------------

export interface IdentifierHealth {
  organizationId: string;
  organizationName: string;
  billingNpiOk: boolean;
  taxIdOk: boolean;
  billingAddressOk: boolean;
  /** Providers in the org missing a valid NPI on file (hard blocker). */
  providersMissingNpi: Array<{ id: string; firstName: string; lastName: string }>;
  /** Providers with a valid NPI but no/invalid taxonomy code. Advisory —
   *  the 837P PRV segment is dropped, which some payers reject. */
  providersMissingTaxonomy: Array<{ id: string; firstName: string; lastName: string }>;
}

/** Snapshot the org's identifier readiness — what's missing or invalid.
 *  Used by the operator dashboard to surface a "you can't bill yet"
 *  banner before a clearinghouse rejection forces the conversation. */
export async function snapshotIdentifierHealth(organizationId: string): Promise<IdentifierHealth> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      billingNpi: true,
      taxId: true,
      billingAddress: true,
    },
  });
  const providers = await prisma.provider.findMany({
    where: { organizationId, active: true },
    select: {
      id: true,
      npi: true,
      taxonomyCode: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });

  const name = (p: (typeof providers)[number]) => ({
    id: p.id,
    firstName: p.user?.firstName ?? "",
    lastName: p.user?.lastName ?? "",
  });

  return {
    organizationId: org.id,
    organizationName: org.name,
    billingNpiOk: isValidNpi(org.billingNpi),
    taxIdOk: !!org.taxId, // ciphertext blob present
    billingAddressOk:
      !!org.billingAddress &&
      typeof org.billingAddress === "object" &&
      typeof (org.billingAddress as Record<string, unknown>).line1 === "string",
    providersMissingNpi: providers.filter((p) => !isValidNpi(p.npi)).map(name),
    // A provider needs a valid NPI before its missing taxonomy is worth
    // flagging — otherwise the NPI gap is the headline issue.
    providersMissingTaxonomy: providers
      .filter((p) => isValidNpi(p.npi) && !isValidTaxonomy(p.taxonomyCode))
      .map(name),
  };
}

// ---------------------------------------------------------------------------
// Bulk import: admin uploads a CSV of provider NPIs (initial onboarding)
// ---------------------------------------------------------------------------

export interface ProviderNpiCsvRow {
  providerId: string;
  npi: string;
  taxonomyCode?: string | null;
}

export interface ProviderNpiImportResult {
  updated: number;
  skipped: Array<{ row: number; providerId: string; reason: string }>;
}

/** Pure CSV → row parser. Exposed for the admin upload UI to preview
 *  parse errors before committing. Header expected:
 *  `provider_id,npi,taxonomy_code`. */
export function parseProviderNpiCsv(csv: string): {
  rows: ProviderNpiCsvRow[];
  errors: Array<{ row: number; message: string }>;
} {
  const lines = csv.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  const errors: Array<{ row: number; message: string }> = [];
  const rows: ProviderNpiCsvRow[] = [];
  if (lines.length === 0) return { rows, errors };

  const header = lines[0].toLowerCase().split(",").map((c) => c.trim());
  const idIdx = header.indexOf("provider_id");
  const npiIdx = header.indexOf("npi");
  const taxIdx = header.indexOf("taxonomy_code");
  if (idIdx < 0 || npiIdx < 0) {
    errors.push({ row: 1, message: "header must contain provider_id, npi" });
    return { rows, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const providerId = cells[idIdx];
    const npi = (cells[npiIdx] ?? "").replace(/\D/g, "");
    if (!providerId || npi.length !== 10) {
      errors.push({ row: i + 1, message: "missing provider_id or NPI not 10 digits" });
      continue;
    }
    if (!isValidNpi(npi)) {
      errors.push({ row: i + 1, message: `NPI ${npi} fails CMS Luhn check` });
      continue;
    }
    rows.push({
      providerId,
      npi,
      taxonomyCode: taxIdx >= 0 && cells[taxIdx] ? cells[taxIdx] : null,
    });
  }
  return { rows, errors };
}

/** Bulk-apply parsed rows. Validates each row, skips invalid ones with a
 *  reason, and returns a summary. Caller is responsible for writing an
 *  AuditLog entry referencing the result. */
export async function applyProviderNpiCsv(args: {
  organizationId: string;
  rows: ProviderNpiCsvRow[];
}): Promise<ProviderNpiImportResult> {
  const result: ProviderNpiImportResult = { updated: 0, skipped: [] };

  // Confirm every providerId belongs to the requesting org so an admin
  // can't accidentally cross-write a sibling tenant.
  const allowed = await prisma.provider.findMany({
    where: {
      organizationId: args.organizationId,
      id: { in: args.rows.map((r) => r.providerId) },
    },
    select: { id: true },
  });
  const allowedIds = new Set(allowed.map((p) => p.id));

  for (let i = 0; i < args.rows.length; i++) {
    const r = args.rows[i];
    if (!allowedIds.has(r.providerId)) {
      result.skipped.push({ row: i + 1, providerId: r.providerId, reason: "provider not in this organization" });
      continue;
    }
    await prisma.provider.update({
      where: { id: r.providerId },
      data: {
        npi: r.npi,
        ...(r.taxonomyCode ? { taxonomyCode: r.taxonomyCode } : {}),
      },
    });
    result.updated++;
  }
  return result;
}

// Re-export for convenience so callers don't have to reach into both files.
export {
  isValidNpi,
  isValidEin,
  normalizeEin,
  resolveBillingIdentifiers,
  type ResolvedBillingIdentifiers,
};
