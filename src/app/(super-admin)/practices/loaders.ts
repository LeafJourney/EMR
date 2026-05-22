// Server-side loader for the post-onboarding Practice Landing dashboard.
//
// Joins PracticeConfiguration → Practice → Organization and computes a
// per-organization KPI rollup (provider count, claims volume, billed/paid
// totals, charges run through the gateway). One round-trip per dimension
// is grouped so this stays fast even at hundreds of practices.

import { prisma } from "@/lib/db/prisma";
import { LEAFJOURNEY_HQ_SLUG } from "@/lib/auth/super-admin-bootstrap";
import {
  ZERO_KPI,
  type PracticeCardData,
  type PracticeKpi,
  type PracticeStakeholder,
} from "./types";

export type { PracticeCardData, PracticeKpi, PracticeStakeholder } from "./types";
export { humanizeCareModel, humanizeSpecialty } from "./types";

// EMR-745 — additional per-practice shapes used by the drill-in page.
export type PracticeProviderRow = {
  providerId: string;
  userId: string;
  name: string;
  email: string;
  title: string | null;
  npi: string | null;
  active: boolean;
  createdAt: string;
};

export type PracticeAuditRow = {
  id: string;
  at: string;
  actorUserId: string;
  actorEmail: string | null;
  actorRoles: string[];
  action: string;
  subjectType: string;
  subjectId: string;
  reason: string | null;
};

// EMR-743 — History tab row + paged result envelope. Shape is intentionally
// a superset of PracticeAuditRow (adds before/after JSON) so the timeline
// can render a one-line summary without a second round trip.
export type PracticeHistoryRow = {
  id: string;
  at: string;
  actorUserId: string;
  actorEmail: string | null;
  actorRoles: string[];
  action: string;
  subjectType: string;
  subjectId: string;
  reason: string | null;
  before: unknown;
  after: unknown;
};

export type PracticeHistoryPage = {
  rows: PracticeHistoryRow[];
  /** Opaque cursor for the next page, or null if exhausted. */
  nextCursor: string | null;
};

export type PracticeBillingMonthRow = {
  monthIso: string; // YYYY-MM-01 in UTC
  monthLabel: string; // "May 2026"
  claimCount: number;
  billedCents: number;
  paidCents: number;
  gatewayChargeCents: number;
};

export type PracticeBillingRollup = {
  mtd: {
    claimCount: number;
    billedCents: number;
    paidCents: number;
    gatewayChargeCents: number;
  };
  last12Months: PracticeBillingMonthRow[];
};

/**
 * Top-level loader. Returns one card per published-or-in-flight
 * PracticeConfiguration, plus a small set of org-level KPIs joined in.
 */
export async function loadPracticeLandingCards(): Promise<PracticeCardData[]> {
  // 1. PracticeConfigurations — the source of truth for "which practices
  //    have been configured." We include drafts so the landing page also
  //    surfaces in-flight onboardings (the card badge distinguishes them).
  const configsRaw = await prisma.practiceConfiguration.findMany({
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      organizationId: true,
      practiceId: true,
      selectedSpecialty: true,
      selectedSpecialtyVersion: true,
      careModel: true,
      enabledModalities: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  if (configsRaw.length === 0) return [];

  const orgIds = Array.from(new Set(configsRaw.map((c) => c.organizationId)));
  const practiceIds = Array.from(
    new Set(
      configsRaw.map((c) => c.practiceId).filter((x): x is string => !!x),
    ),
  );

  // 2. Pull all the related rows we need in parallel.
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    orgs,
    practices,
    memberships,
    providers,
    claimsGroup,
    claimsLast30Group,
    chargesGroup,
    encountersGroup,
    encountersLast30Group,
    patientsGroup,
  ] = await Promise.all([
    prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: {
        id: true,
        name: true,
        slug: true,
        legalName: true,
        brandName: true,
        primaryContactName: true,
        primaryContactEmail: true,
      },
    }),
    practiceIds.length
      ? prisma.practice.findMany({
          where: { id: { in: practiceIds } },
          select: {
            id: true,
            organizationId: true,
            name: true,
            city: true,
            state: true,
            timeZone: true,
          },
        })
      : Promise.resolve([] as Array<{
          id: string;
          organizationId: string;
          name: string;
          city: string | null;
          state: string | null;
          timeZone: string | null;
        }>),
    prisma.membership.findMany({
      where: {
        organizationId: { in: orgIds },
        role: { in: ["practice_admin", "operator", "practice_owner"] },
      },
      select: {
        organizationId: true,
        role: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
    prisma.provider.findMany({
      where: { organizationId: { in: orgIds } },
      select: {
        id: true,
        organizationId: true,
        title: true,
        active: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    }),
    prisma.claim.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: orgIds } },
      _count: { _all: true },
      _sum: { billedAmountCents: true, paidAmountCents: true },
    }),
    prisma.claim.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: orgIds },
        createdAt: { gte: since30 },
      },
      _count: { _all: true },
    }),
    prisma.charge.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: orgIds } },
      _sum: { feeAmountCents: true },
    }),
    prisma.encounter.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: orgIds } },
      _count: { _all: true },
    }),
    prisma.encounter.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: orgIds },
        createdAt: { gte: since30 },
      },
      _count: { _all: true },
    }),
    prisma.patient.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: orgIds }, deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  // 3. Index everything by organizationId so the per-card build is O(1).
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const practiceById = new Map(practices.map((p) => [p.id, p]));

  const officeManagersByOrg = new Map<string, PracticeStakeholder[]>();
  for (const m of memberships) {
    const arr = officeManagersByOrg.get(m.organizationId) ?? [];
    arr.push({
      userId: m.user.id,
      name: `${m.user.firstName} ${m.user.lastName}`.trim(),
      email: m.user.email,
      role: m.role,
    });
    officeManagersByOrg.set(m.organizationId, arr);
  }

  const providersByOrg = new Map<string, PracticeStakeholder[]>();
  for (const p of providers) {
    const arr = providersByOrg.get(p.organizationId) ?? [];
    arr.push({
      userId: p.user.id,
      name: `${p.user.firstName} ${p.user.lastName}`.trim(),
      email: p.user.email,
      role: "provider",
      title: p.title,
    });
    providersByOrg.set(p.organizationId, arr);
  }

  const kpiByOrg = new Map<string, PracticeKpi>();
  function ensureKpi(orgId: string): PracticeKpi {
    const existing = kpiByOrg.get(orgId);
    if (existing) return existing;
    const fresh = { ...ZERO_KPI };
    kpiByOrg.set(orgId, fresh);
    return fresh;
  }
  for (const row of claimsGroup) {
    const k = ensureKpi(row.organizationId);
    k.claimCount = row._count._all;
    k.billedCents = row._sum.billedAmountCents ?? 0;
    k.paidCents = row._sum.paidAmountCents ?? 0;
  }
  for (const row of claimsLast30Group) {
    ensureKpi(row.organizationId).claimsLast30 = row._count._all;
  }
  for (const row of chargesGroup) {
    ensureKpi(row.organizationId).gatewayChargeCents = row._sum.feeAmountCents ?? 0;
  }
  for (const row of encountersGroup) {
    ensureKpi(row.organizationId).encounterCount = row._count._all;
  }
  for (const row of encountersLast30Group) {
    ensureKpi(row.organizationId).encountersLast30 = row._count._all;
  }
  for (const row of patientsGroup) {
    ensureKpi(row.organizationId).patientCount = row._count._all;
  }
  for (const orgId of orgIds) {
    const orgProviders = providers.filter((p) => p.organizationId === orgId);
    const k = ensureKpi(orgId);
    k.providerCount = orgProviders.length;
    k.activeProviderCount = orgProviders.filter((p) => p.active).length;
  }

  // 4. Build the final card rows.
  return configsRaw
    // Drop the synthetic HQ org — it's an internal carrier, not a real practice.
    .filter((c) => orgById.get(c.organizationId)?.slug !== LEAFJOURNEY_HQ_SLUG)
    .map((c): PracticeCardData => {
      const org = orgById.get(c.organizationId);
      const practice = c.practiceId ? practiceById.get(c.practiceId) : undefined;
      const orgManagers = officeManagersByOrg.get(c.organizationId) ?? [];
      const orgProviders = providersByOrg.get(c.organizationId) ?? [];

      return {
        practiceId: practice?.id ?? null,
        configId: c.id,
        organizationId: c.organizationId,
        organizationName: org?.name ?? "(unknown organization)",
        practiceName:
          practice?.name ?? org?.brandName ?? org?.name ?? "Untitled practice",
        brandName: org?.brandName ?? null,
        legalName: org?.legalName ?? null,
        city: practice?.city ?? null,
        state: practice?.state ?? null,
        timeZone: practice?.timeZone ?? null,
        primaryContactName: org?.primaryContactName ?? null,
        primaryContactEmail: org?.primaryContactEmail ?? null,
        specialty: c.selectedSpecialty ?? null,
        specialtyVersion: c.selectedSpecialtyVersion ?? null,
        careModel: c.careModel ?? null,
        enabledModalities: c.enabledModalities ?? [],
        status: String(c.status),
        publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
        updatedAt: c.updatedAt ? c.updatedAt.toISOString() : null,
        officeManagers: orgManagers.slice(0, 3),
        leadProviders: orgProviders.slice(0, 4),
        kpi: kpiByOrg.get(c.organizationId) ?? { ...ZERO_KPI },
      };
    });
}

// --------------------------------------------------------------
// EMR-745 — Per-practice drill-in loaders
// --------------------------------------------------------------
//
// These intentionally reuse the same `groupBy + _sum + _count` shape used
// by the fleet loader above so the drill-in page never diverges from the
// list card. Each tab is its own loader so we can lazy-load on selection
// rather than fetching everything up front.

/**
 * Resolves a route `[id]` to the underlying PracticeConfiguration. The
 * `id` may be a PracticeConfiguration id OR an organizationId — both are
 * legal entry points (audit log rows link by `organizationId`, the fleet
 * card uses `configId`). Returns null if not found.
 */
export async function loadPracticeOverview(
  id: string,
): Promise<PracticeCardData | null> {
  // Try config-id first, then fall back to organizationId.
  const config =
    (await prisma.practiceConfiguration.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        practiceId: true,
        selectedSpecialty: true,
        selectedSpecialtyVersion: true,
        careModel: true,
        enabledModalities: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
      },
    })) ??
    (await prisma.practiceConfiguration.findFirst({
      where: { organizationId: id },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        organizationId: true,
        practiceId: true,
        selectedSpecialty: true,
        selectedSpecialtyVersion: true,
        careModel: true,
        enabledModalities: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
      },
    }));

  if (!config) return null;

  const orgId = config.organizationId;
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    org,
    practice,
    memberships,
    providers,
    claimsAgg,
    claimsLast30,
    chargesAgg,
    encounterCount,
    encountersLast30,
    patientCount,
  ] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        slug: true,
        legalName: true,
        brandName: true,
        primaryContactName: true,
        primaryContactEmail: true,
      },
    }),
    config.practiceId
      ? prisma.practice.findUnique({
          where: { id: config.practiceId },
          select: {
            id: true,
            organizationId: true,
            name: true,
            city: true,
            state: true,
            timeZone: true,
          },
        })
      : Promise.resolve(null),
    prisma.membership.findMany({
      where: {
        organizationId: orgId,
        role: { in: ["practice_admin", "operator", "practice_owner"] },
      },
      select: {
        organizationId: true,
        role: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    }),
    prisma.provider.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        active: true,
        title: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    }),
    prisma.claim.aggregate({
      where: { organizationId: orgId },
      _count: { _all: true },
      _sum: { billedAmountCents: true, paidAmountCents: true },
    }),
    prisma.claim.count({
      where: { organizationId: orgId, createdAt: { gte: since30 } },
    }),
    prisma.charge.aggregate({
      where: { organizationId: orgId },
      _sum: { feeAmountCents: true },
    }),
    prisma.encounter.count({ where: { organizationId: orgId } }),
    prisma.encounter.count({
      where: { organizationId: orgId, createdAt: { gte: since30 } },
    }),
    prisma.patient.count({ where: { organizationId: orgId, deletedAt: null } }),
  ]);

  if (!org) return null;
  if (org.slug === LEAFJOURNEY_HQ_SLUG) return null;

  const kpi: PracticeKpi = {
    ...ZERO_KPI,
    providerCount: providers.length,
    activeProviderCount: providers.filter((p) => p.active).length,
    patientCount,
    claimCount: claimsAgg._count._all,
    claimsLast30,
    billedCents: claimsAgg._sum.billedAmountCents ?? 0,
    paidCents: claimsAgg._sum.paidAmountCents ?? 0,
    gatewayChargeCents: chargesAgg._sum.feeAmountCents ?? 0,
    encounterCount,
    encountersLast30,
  };

  const officeManagers: PracticeStakeholder[] = memberships.map((m) => ({
    userId: m.user.id,
    name: `${m.user.firstName} ${m.user.lastName}`.trim(),
    email: m.user.email,
    role: m.role,
  }));
  const leadProviders: PracticeStakeholder[] = providers.map((p) => ({
    userId: p.user.id,
    name: `${p.user.firstName} ${p.user.lastName}`.trim(),
    email: p.user.email,
    role: "provider",
    title: p.title,
  }));

  return {
    practiceId: practice?.id ?? null,
    configId: config.id,
    organizationId: orgId,
    organizationName: org.name,
    practiceName: practice?.name ?? org.brandName ?? org.name ?? "Untitled practice",
    brandName: org.brandName ?? null,
    legalName: org.legalName ?? null,
    city: practice?.city ?? null,
    state: practice?.state ?? null,
    timeZone: practice?.timeZone ?? null,
    primaryContactName: org.primaryContactName ?? null,
    primaryContactEmail: org.primaryContactEmail ?? null,
    specialty: config.selectedSpecialty ?? null,
    specialtyVersion: config.selectedSpecialtyVersion ?? null,
    careModel: config.careModel ?? null,
    enabledModalities: config.enabledModalities ?? [],
    status: String(config.status),
    publishedAt: config.publishedAt ? config.publishedAt.toISOString() : null,
    updatedAt: config.updatedAt ? config.updatedAt.toISOString() : null,
    officeManagers: officeManagers.slice(0, 3),
    leadProviders: leadProviders.slice(0, 4),
    kpi,
  };
}

/**
 * Lists every Provider in a practice with the joined User for name/email
 * display. Sorted active-first, then newest. Used by the Providers tab.
 */
export async function loadPracticeProviders(
  organizationId: string,
): Promise<PracticeProviderRow[]> {
  const providers = await prisma.provider.findMany({
    where: { organizationId },
    select: {
      id: true,
      title: true,
      active: true,
      npi: true,
      createdAt: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });

  return providers.map((p) => ({
    providerId: p.id,
    userId: p.user.id,
    name: `${p.user.firstName} ${p.user.lastName}`.trim() || p.user.email,
    email: p.user.email,
    title: p.title,
    npi: p.npi,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
  }));
}

/**
 * Returns the most recent 100 ControllerAuditLog rows for an organization.
 * Used by the Activity tab.
 */
export async function loadPracticeAuditLog(
  organizationId: string,
  limit: number = 100,
): Promise<PracticeAuditRow[]> {
  const rows = await prisma.controllerAuditLog.findMany({
    where: { organizationId },
    orderBy: [{ at: "desc" }],
    take: limit,
    select: {
      id: true,
      at: true,
      actorUserId: true,
      actorEmail: true,
      actorRoles: true,
      action: true,
      subjectType: true,
      subjectId: true,
      reason: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    actorUserId: r.actorUserId,
    actorEmail: r.actorEmail,
    actorRoles: r.actorRoles.map((role) => String(role)),
    action: r.action,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    reason: r.reason,
  }));
}

/**
 * Computes month-to-date and last-12-months rollups for Claim + Charge
 * volume against a single organization. Reuses the `groupBy + _sum +
 * _count` shape from the fleet loader.
 */
export async function loadPracticeBilling(
  organizationId: string,
): Promise<PracticeBillingRollup> {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  // 12 calendar months back, anchored at the first of the month so the
  // bucket boundaries don't drift relative to the current day.
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1),
  );

  const [mtdClaims, mtdCharges, windowClaims, windowCharges] =
    await Promise.all([
      prisma.claim.aggregate({
        where: { organizationId, createdAt: { gte: monthStart } },
        _count: { _all: true },
        _sum: { billedAmountCents: true, paidAmountCents: true },
      }),
      prisma.charge.aggregate({
        where: { organizationId, createdAt: { gte: monthStart } },
        _sum: { feeAmountCents: true },
      }),
      prisma.claim.findMany({
        where: { organizationId, createdAt: { gte: windowStart } },
        select: {
          createdAt: true,
          billedAmountCents: true,
          paidAmountCents: true,
        },
      }),
      prisma.charge.findMany({
        where: { organizationId, createdAt: { gte: windowStart } },
        select: { createdAt: true, feeAmountCents: true },
      }),
    ]);

  // Bucket into a Map keyed by YYYY-MM-01 UTC iso string.
  type Bucket = {
    monthIso: string;
    monthLabel: string;
    claimCount: number;
    billedCents: number;
    paidCents: number;
    gatewayChargeCents: number;
  };
  const buckets = new Map<string, Bucket>();
  const monthLabels = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1),
    );
    const iso = d.toISOString();
    buckets.set(iso, {
      monthIso: iso,
      monthLabel: monthLabels.format(d),
      claimCount: 0,
      billedCents: 0,
      paidCents: 0,
      gatewayChargeCents: 0,
    });
  }

  function bucketKeyFor(date: Date): string {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
    ).toISOString();
  }

  for (const claim of windowClaims) {
    const b = buckets.get(bucketKeyFor(claim.createdAt));
    if (!b) continue;
    b.claimCount += 1;
    b.billedCents += claim.billedAmountCents;
    b.paidCents += claim.paidAmountCents;
  }
  for (const charge of windowCharges) {
    const b = buckets.get(bucketKeyFor(charge.createdAt));
    if (!b) continue;
    b.gatewayChargeCents += charge.feeAmountCents;
  }

  const last12Months: PracticeBillingMonthRow[] = Array.from(
    buckets.values(),
  ).sort((a, b) => (a.monthIso < b.monthIso ? -1 : 1));

  return {
    mtd: {
      claimCount: mtdClaims._count._all,
      billedCents: mtdClaims._sum.billedAmountCents ?? 0,
      paidCents: mtdClaims._sum.paidAmountCents ?? 0,
      gatewayChargeCents: mtdCharges._sum.feeAmountCents ?? 0,
    },
    last12Months,
  };
}

// --------------------------------------------------------------
// EMR-743 — History tab loader (cursor-paged audit timeline)
// --------------------------------------------------------------
//
// Reads ControllerAuditLog rows whose `organizationId` matches the practice
// OR whose `subjectId` matches a known config / practice id for the same
// practice. Cursor-paged most-recent-first so "Load more" can append
// without refetching the head of the timeline.
//
// The cursor is an opaque `${atIso}|${id}` string — we tiebreak on `id` so
// two rows with identical `at` (rare but possible — the audit writer uses
// `default(now())`) don't get skipped or duplicated.

/** Default page size for the history timeline. */
export const PRACTICE_HISTORY_PAGE_SIZE = 25;

/** Hard upper bound on `take` to protect against runaway query params. */
const PRACTICE_HISTORY_MAX_PAGE_SIZE = 100;

/**
 * Encode a (timestamp, id) tuple as an opaque cursor for the URL.
 * Exported for tests / route handlers; the format is deliberately stable.
 */
export function encodeHistoryCursor(at: Date, id: string): string {
  return `${at.toISOString()}|${id}`;
}

/**
 * Inverse of `encodeHistoryCursor`. Returns null when the input is
 * malformed — callers should treat that as "no cursor".
 */
export function decodeHistoryCursor(
  cursor: string | null | undefined,
): { at: Date; id: string } | null {
  if (!cursor) return null;
  const idx = cursor.indexOf("|");
  if (idx <= 0) return null;
  const atRaw = cursor.slice(0, idx);
  const id = cursor.slice(idx + 1);
  if (!id) return null;
  const at = new Date(atRaw);
  if (Number.isNaN(at.getTime())) return null;
  return { at, id };
}

/**
 * Page of ControllerAuditLog rows for a practice. Cursor is the
 * `(at, id)` of the last row returned; pass it back as `cursor` for the
 * next page. Returns at most `pageSize` rows.
 *
 * `organizationId` is the canonical lookup key; we also OR-in any rows
 * whose `subjectId` matches the practice's configuration id or practice
 * id, so audit rows emitted before `organizationId` was populated on the
 * row (or on a different scope) still surface here.
 */
export async function loadPracticeHistoryPage(args: {
  organizationId: string;
  /** Additional subjectIds (e.g. PracticeConfiguration.id, Practice.id) to OR-in. */
  alsoSubjectIds?: string[];
  cursor?: string | null;
  pageSize?: number;
}): Promise<PracticeHistoryPage> {
  const pageSize = Math.min(
    Math.max(1, args.pageSize ?? PRACTICE_HISTORY_PAGE_SIZE),
    PRACTICE_HISTORY_MAX_PAGE_SIZE,
  );
  const decoded = decodeHistoryCursor(args.cursor);

  // OR clause: organizationId match OR subjectId in [config.id, practice.id].
  const subjectIds = Array.from(
    new Set((args.alsoSubjectIds ?? []).filter((s): s is string => !!s)),
  );

  const scope =
    subjectIds.length > 0
      ? {
          OR: [
            { organizationId: args.organizationId },
            { subjectId: { in: subjectIds } },
          ],
        }
      : { organizationId: args.organizationId };

  // Cursor predicate: rows strictly older than (at, id).
  //
  // Prisma's built-in `cursor` option does a single-column tie-break and
  // can't AND `(at < x) OR (at = x AND id < y)` directly without raw SQL,
  // so we filter in `where` and order by (at desc, id desc).
  const cursorPredicate = decoded
    ? {
        OR: [
          { at: { lt: decoded.at } },
          { AND: [{ at: decoded.at }, { id: { lt: decoded.id } }] },
        ],
      }
    : null;

  const where = cursorPredicate
    ? { AND: [scope, cursorPredicate] }
    : scope;

  // Fetch pageSize + 1 so we know whether another page exists without a
  // separate count round-trip.
  const raw = await prisma.controllerAuditLog.findMany({
    where,
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    select: {
      id: true,
      at: true,
      actorUserId: true,
      actorEmail: true,
      actorRoles: true,
      action: true,
      subjectType: true,
      subjectId: true,
      reason: true,
      before: true,
      after: true,
    },
  });

  const hasMore = raw.length > pageSize;
  const page = hasMore ? raw.slice(0, pageSize) : raw;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeHistoryCursor(last.at, last.id) : null;

  return {
    rows: page.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      actorUserId: r.actorUserId,
      actorEmail: r.actorEmail,
      actorRoles: r.actorRoles.map((role) => String(role)),
      action: r.action,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      reason: r.reason,
      before: r.before,
      after: r.after,
    })),
    nextCursor,
  };
}
