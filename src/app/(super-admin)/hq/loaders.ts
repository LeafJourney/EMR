// EMR-731 — Fleet aggregates data layer for the HQ super-admin dashboard.
//
// Every loader returns counts / sums / IDs only — never PHI. Each is wrapped
// in Next.js `unstable_cache` with a 60s TTL (configurable via
// HQ_CACHE_TTL_SECONDS) keyed by loader name + parameters so a single page
// render is one parallel fan-out of cheap cache reads.
//
// Modelled after `src/app/(super-admin)/practices/loaders.ts`: same
// `groupBy + _count + _sum` discipline, all I/O behind a single Promise.all,
// money in cents.

import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { LEAFJOURNEY_HQ_SLUG } from "@/lib/auth/super-admin-bootstrap";
import {
  isStuckConfig,
  medianMs,
  momDelta,
  zeroFillDailySeries,
  type FleetCounts,
  type FleetDailyPoint,
  type FleetRevenue,
  type HqDashboardSnapshot,
  type ModalityMixRow,
  type OnboardingFunnelStage,
  type RecentActivityRow,
  type SpecialtyDriftRow,
  type SpecialtyMixRow,
  type TopPracticeRow,
  type TopPracticesMetric,
} from "./types";

export type {
  FleetCounts,
  FleetDailyPoint,
  FleetRevenue,
  HqDashboardSnapshot,
  ModalityMixRow,
  OnboardingFunnelStage,
  RecentActivityRow,
  SpecialtyDriftRow,
  SpecialtyMixRow,
  TopPracticeRow,
  TopPracticesMetric,
} from "./types";

export const HQ_CACHE_TTL_SECONDS = (() => {
  const raw = process.env.HQ_CACHE_TTL_SECONDS;
  if (!raw) return 60;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 60;
})();

const STUCK_HOURS = 24;
const HQ_TAG = "hq-fleet";

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfPrevMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}

function cached<TArgs extends unknown[], TResult>(
  name: string,
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) =>
    unstable_cache(() => fn(...args), [name, ...args.map((a) => JSON.stringify(a))], {
      revalidate: HQ_CACHE_TTL_SECONDS,
      tags: [HQ_TAG, `${HQ_TAG}:${name}`],
    })();
}

async function nonHqOrgIds(): Promise<string[]> {
  const orgs = await prisma.organization.findMany({
    where: { slug: { not: LEAFJOURNEY_HQ_SLUG } },
    select: { id: true },
  });
  return orgs.map((o) => o.id);
}

export const getFleetCounts = cached(
  "getFleetCounts",
  async (): Promise<FleetCounts> => {
    const orgIds = await nonHqOrgIds();
    if (orgIds.length === 0) {
      return {
        practicesLive: 0,
        practicesOnboarding: 0,
        practicesStuck: 0,
        providersActive: 0,
        patientsActive: 0,
      };
    }

    const [configs, providers, patients] = await Promise.all([
      prisma.practiceConfiguration.findMany({
        where: { organizationId: { in: orgIds } },
        select: { status: true, updatedAt: true },
      }),
      prisma.provider.count({
        where: { organizationId: { in: orgIds }, active: true },
      }),
      prisma.patient.count({
        where: {
          organizationId: { in: orgIds },
          deletedAt: null,
          status: "active",
        },
      }),
    ]);

    const now = new Date();
    let live = 0;
    let onboarding = 0;
    let stuck = 0;
    for (const c of configs) {
      const status = String(c.status);
      if (status === "published") {
        live += 1;
      } else if (status !== "archived") {
        onboarding += 1;
        if (isStuckConfig(status, c.updatedAt, now, STUCK_HOURS)) stuck += 1;
      }
    }

    return {
      practicesLive: live,
      practicesOnboarding: onboarding,
      practicesStuck: stuck,
      providersActive: providers,
      patientsActive: patients,
    };
  },
);

export const getFleetRevenue = cached(
  "getFleetRevenue",
  async (): Promise<FleetRevenue> => {
    const orgIds = await nonHqOrgIds();
    if (orgIds.length === 0) {
      return {
        billedCentsMTD: 0,
        collectedCentsMTD: 0,
        gmvCentsMTD: 0,
        billedCentsPrevMonth: 0,
        collectedCentsPrevMonth: 0,
        gmvCentsPrevMonth: 0,
      };
    }

    const now = new Date();
    const curStart = startOfMonthUtc(now);
    const prevStart = startOfPrevMonthUtc(now);

    const [claimsCur, claimsPrev, chargesCur, chargesPrev] = await Promise.all([
      prisma.claim.aggregate({
        where: {
          organizationId: { in: orgIds },
          serviceDate: { gte: curStart },
        },
        _sum: { billedAmountCents: true, paidAmountCents: true },
      }),
      prisma.claim.aggregate({
        where: {
          organizationId: { in: orgIds },
          serviceDate: { gte: prevStart, lt: curStart },
        },
        _sum: { billedAmountCents: true, paidAmountCents: true },
      }),
      prisma.charge.aggregate({
        where: {
          organizationId: { in: orgIds },
          createdAt: { gte: curStart },
        },
        _sum: { feeAmountCents: true },
      }),
      prisma.charge.aggregate({
        where: {
          organizationId: { in: orgIds },
          createdAt: { gte: prevStart, lt: curStart },
        },
        _sum: { feeAmountCents: true },
      }),
    ]);

    return {
      billedCentsMTD: claimsCur._sum.billedAmountCents ?? 0,
      collectedCentsMTD: claimsCur._sum.paidAmountCents ?? 0,
      gmvCentsMTD: chargesCur._sum.feeAmountCents ?? 0,
      billedCentsPrevMonth: claimsPrev._sum.billedAmountCents ?? 0,
      collectedCentsPrevMonth: claimsPrev._sum.paidAmountCents ?? 0,
      gmvCentsPrevMonth: chargesPrev._sum.feeAmountCents ?? 0,
    };
  },
);

export const getFleetDailySeries = cached(
  "getFleetDailySeries",
  async (days: number = 30): Promise<FleetDailyPoint[]> => {
    const orgIds = await nonHqOrgIds();
    const now = new Date();
    const since = new Date(now.getTime() - days * 86_400_000);

    if (orgIds.length === 0) {
      return zeroFillDailySeries(new Map(), days, now);
    }

    const [claims, charges, encounters, patients] = await Promise.all([
      prisma.claim.findMany({
        where: {
          organizationId: { in: orgIds },
          serviceDate: { gte: since },
        },
        select: { serviceDate: true, billedAmountCents: true },
      }),
      prisma.charge.findMany({
        where: {
          organizationId: { in: orgIds },
          createdAt: { gte: since },
        },
        select: { createdAt: true },
      }),
      prisma.encounter.findMany({
        where: {
          organizationId: { in: orgIds },
          createdAt: { gte: since },
        },
        select: { createdAt: true },
      }),
      prisma.patient.findMany({
        where: {
          organizationId: { in: orgIds },
          createdAt: { gte: since },
          deletedAt: null,
        },
        select: { createdAt: true },
      }),
    ]);

    const buckets = new Map<
      string,
      {
        claims: number;
        charges: number;
        encounters: number;
        billedCents: number;
        newPatients: number;
      }
    >();
    function bucket(key: string) {
      const existing = buckets.get(key);
      if (existing) return existing;
      const fresh = {
        claims: 0,
        charges: 0,
        encounters: 0,
        billedCents: 0,
        newPatients: 0,
      };
      buckets.set(key, fresh);
      return fresh;
    }
    function dayKey(d: Date): string {
      return d.toISOString().slice(0, 10);
    }
    for (const c of claims) {
      const b = bucket(dayKey(c.serviceDate));
      b.claims += 1;
      b.billedCents += c.billedAmountCents;
    }
    for (const c of charges) bucket(dayKey(c.createdAt)).charges += 1;
    for (const e of encounters) bucket(dayKey(e.createdAt)).encounters += 1;
    for (const p of patients) bucket(dayKey(p.createdAt)).newPatients += 1;

    return zeroFillDailySeries(buckets, days, now);
  },
);

export const getOnboardingFunnel = cached(
  "getOnboardingFunnel",
  async (): Promise<OnboardingFunnelStage[]> => {
    const orgIds = await nonHqOrgIds();
    if (orgIds.length === 0) return [];

    const configs = await prisma.practiceConfiguration.findMany({
      where: { organizationId: { in: orgIds } },
      select: { status: true, createdAt: true, updatedAt: true, publishedAt: true },
    });

    const buckets = new Map<string, number[]>();
    const stuckByStatus = new Map<string, number>();
    const now = new Date();
    const nowMs = now.getTime();
    for (const c of configs) {
      const status = String(c.status);
      const arr = buckets.get(status) ?? [];
      const end =
        status === "published" && c.publishedAt
          ? c.publishedAt.getTime()
          : nowMs;
      arr.push(end - c.createdAt.getTime());
      buckets.set(status, arr);
      if (isStuckConfig(status, c.updatedAt, now, STUCK_HOURS)) {
        stuckByStatus.set(status, (stuckByStatus.get(status) ?? 0) + 1);
      }
    }
    return Array.from(buckets.entries()).map(([status, durations]) => ({
      status,
      count: durations.length,
      medianHoursInStage: medianMs(durations) / (60 * 60 * 1000),
      stuckCount: stuckByStatus.get(status) ?? 0,
    }));
  },
);

export const getModalityMix = cached(
  "getModalityMix",
  async (): Promise<ModalityMixRow[]> => {
    const orgIds = await nonHqOrgIds();
    if (orgIds.length === 0) return [];

    const configs = await prisma.practiceConfiguration.findMany({
      where: {
        organizationId: { in: orgIds },
        status: "published",
      },
      select: { enabledModalities: true },
    });

    const counts = new Map<string, number>();
    for (const c of configs) {
      for (const m of c.enabledModalities ?? []) {
        counts.set(m, (counts.get(m) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([modality, practiceCount]) => ({ modality, practiceCount }))
      .sort((a, b) => b.practiceCount - a.practiceCount);
  },
);

export const getSpecialtyMix = cached(
  "getSpecialtyMix",
  async (): Promise<SpecialtyMixRow[]> => {
    const orgIds = await nonHqOrgIds();
    if (orgIds.length === 0) return [];

    const groups = await prisma.practiceConfiguration.groupBy({
      by: ["selectedSpecialty", "selectedSpecialtyVersion"],
      where: {
        organizationId: { in: orgIds },
        status: "published",
        selectedSpecialty: { not: null },
      },
      _count: { _all: true },
    });
    return groups
      .filter((g) => g.selectedSpecialty)
      .map((g) => ({
        specialty: g.selectedSpecialty as string,
        manifestVersion: g.selectedSpecialtyVersion ?? "unknown",
        practiceCount: g._count._all,
      }))
      .sort((a, b) => b.practiceCount - a.practiceCount);
  },
);

export const getSpecialtyVersionDrift = cached(
  "getSpecialtyVersionDrift",
  async (): Promise<SpecialtyDriftRow[]> => {
    const mix = await getSpecialtyMix();
    const bySpecialty = new Map<string, { latest: string; rows: SpecialtyMixRow[] }>();
    for (const row of mix) {
      const entry = bySpecialty.get(row.specialty) ?? {
        latest: row.manifestVersion,
        rows: [],
      };
      entry.rows.push(row);
      if (row.manifestVersion > entry.latest) entry.latest = row.manifestVersion;
      bySpecialty.set(row.specialty, entry);
    }
    const out: SpecialtyDriftRow[] = [];
    for (const [specialty, { latest, rows }] of bySpecialty.entries()) {
      for (const r of rows) {
        if (r.manifestVersion !== latest) {
          out.push({
            specialty,
            latestVersion: latest,
            currentVersion: r.manifestVersion,
            practiceCount: r.practiceCount,
          });
        }
      }
    }
    return out;
  },
);

async function topByClaimsImpl(limit: number): Promise<TopPracticeRow[]> {
  const orgIds = await nonHqOrgIds();
  if (orgIds.length === 0) return [];

  const now = new Date();
  const curStart = startOfMonthUtc(now);
  const prevStart = startOfPrevMonthUtc(now);

  const [cur, prev, orgs] = await Promise.all([
    prisma.claim.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: orgIds },
        serviceDate: { gte: curStart },
      },
      _count: { _all: true },
    }),
    prisma.claim.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: orgIds },
        serviceDate: { gte: prevStart, lt: curStart },
      },
      _count: { _all: true },
    }),
    prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true, brandName: true },
    }),
  ]);

  const prevByOrg = new Map(prev.map((r) => [r.organizationId, r._count._all]));
  const nameByOrg = new Map(orgs.map((o) => [o.id, o.brandName ?? o.name]));
  return cur
    .map((r) => {
      const prevValue = prevByOrg.get(r.organizationId) ?? 0;
      return {
        organizationId: r.organizationId,
        practiceName: nameByOrg.get(r.organizationId) ?? "(unknown)",
        metric: r._count._all,
        momDelta: momDelta(r._count._all, prevValue),
        prevMetric: prevValue,
      };
    })
    .sort((a, b) => b.metric - a.metric)
    .slice(0, limit);
}

async function topByRevenueImpl(limit: number): Promise<TopPracticeRow[]> {
  const orgIds = await nonHqOrgIds();
  if (orgIds.length === 0) return [];

  const now = new Date();
  const curStart = startOfMonthUtc(now);
  const prevStart = startOfPrevMonthUtc(now);

  const [cur, prev, orgs] = await Promise.all([
    prisma.claim.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: orgIds },
        serviceDate: { gte: curStart },
      },
      _sum: { billedAmountCents: true },
    }),
    prisma.claim.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: orgIds },
        serviceDate: { gte: prevStart, lt: curStart },
      },
      _sum: { billedAmountCents: true },
    }),
    prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true, brandName: true },
    }),
  ]);

  const prevByOrg = new Map(
    prev.map((r) => [r.organizationId, r._sum.billedAmountCents ?? 0]),
  );
  const nameByOrg = new Map(orgs.map((o) => [o.id, o.brandName ?? o.name]));
  return cur
    .map((r) => {
      const billed = r._sum.billedAmountCents ?? 0;
      const prevValue = prevByOrg.get(r.organizationId) ?? 0;
      return {
        organizationId: r.organizationId,
        practiceName: nameByOrg.get(r.organizationId) ?? "(unknown)",
        metric: billed,
        momDelta: momDelta(billed, prevValue),
        prevMetric: prevValue,
      };
    })
    .sort((a, b) => b.metric - a.metric)
    .slice(0, limit);
}

async function topByPatientGrowthImpl(limit: number): Promise<TopPracticeRow[]> {
  const orgIds = await nonHqOrgIds();
  if (orgIds.length === 0) return [];

  const now = new Date();
  const curStart = startOfMonthUtc(now);
  const prevStart = startOfPrevMonthUtc(now);

  const [cur, prev, orgs] = await Promise.all([
    prisma.patient.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: orgIds },
        deletedAt: null,
        createdAt: { gte: curStart },
      },
      _count: { _all: true },
    }),
    prisma.patient.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: orgIds },
        deletedAt: null,
        createdAt: { gte: prevStart, lt: curStart },
      },
      _count: { _all: true },
    }),
    prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true, brandName: true },
    }),
  ]);

  const prevByOrg = new Map(prev.map((r) => [r.organizationId, r._count._all]));
  const nameByOrg = new Map(orgs.map((o) => [o.id, o.brandName ?? o.name]));
  return cur
    .map((r) => {
      const prevValue = prevByOrg.get(r.organizationId) ?? 0;
      return {
        organizationId: r.organizationId,
        practiceName: nameByOrg.get(r.organizationId) ?? "(unknown)",
        metric: r._count._all,
        momDelta: momDelta(r._count._all, prevValue),
        prevMetric: prevValue,
      };
    })
    .sort((a, b) => b.metric - a.metric)
    .slice(0, limit);
}

export const getTopPracticesByClaims = cached(
  "getTopPracticesByClaims",
  async (limit: number = 5) => topByClaimsImpl(limit),
);

export const getTopPracticesByRevenue = cached(
  "getTopPracticesByRevenue",
  async (limit: number = 5) => topByRevenueImpl(limit),
);

export const getTopPracticesByPatientGrowth = cached(
  "getTopPracticesByPatientGrowth",
  async (limit: number = 5) => topByPatientGrowthImpl(limit),
);

/**
 * Generic dispatcher matching the parent prompt's `loadTopPractices(metric, limit)`
 * signature.
 */
export async function getTopPractices(
  metric: TopPracticesMetric,
  limit: number = 5,
): Promise<TopPracticeRow[]> {
  switch (metric) {
    case "claims":
      return getTopPracticesByClaims(limit);
    case "billed":
      return getTopPracticesByRevenue(limit);
    case "patientGrowth":
      return getTopPracticesByPatientGrowth(limit);
  }
}

function deeplinkFor(row: {
  subjectType: string;
  subjectId: string;
  organizationId: string | null;
}): string {
  if (row.organizationId) {
    return `/practices?org=${encodeURIComponent(row.organizationId)}`;
  }
  return `/admin/audit/${encodeURIComponent(row.subjectId)}`;
}

export const getRecentActivity = cached(
  "getRecentActivity",
  async (hours: number = 24): Promise<RecentActivityRow[]> => {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const rows = await prisma.controllerAuditLog.findMany({
      where: { at: { gte: since } },
      orderBy: { at: "desc" },
      take: 100,
      select: {
        id: true,
        at: true,
        actorUserId: true,
        actorEmail: true,
        organizationId: true,
        action: true,
        subjectType: true,
        subjectId: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      actorUserId: r.actorUserId,
      actorEmail: r.actorEmail,
      organizationId: r.organizationId,
      action: r.action,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      deeplink: deeplinkFor(r),
    }));
  },
);

/**
 * Umbrella loader — runs every individual loader in parallel. Page components
 * should call this once and destructure the snapshot.
 */
export async function loadAllHqData(): Promise<HqDashboardSnapshot> {
  const [
    counts,
    revenue,
    dailySeries,
    onboardingFunnel,
    modalityMix,
    specialtyMix,
    specialtyDrift,
    topByClaims,
    topByRevenue,
    topByPatientGrowth,
    recentActivity,
  ] = await Promise.all([
    getFleetCounts(),
    getFleetRevenue(),
    getFleetDailySeries(30),
    getOnboardingFunnel(),
    getModalityMix(),
    getSpecialtyMix(),
    getSpecialtyVersionDrift(),
    getTopPracticesByClaims(5),
    getTopPracticesByRevenue(5),
    getTopPracticesByPatientGrowth(5),
    getRecentActivity(24),
  ]);
  return {
    counts,
    revenue,
    dailySeries,
    onboardingFunnel,
    modalityMix,
    specialtyMix,
    specialtyDrift,
    topByClaims,
    topByRevenue,
    topByPatientGrowth,
    recentActivity,
  };
}
