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
