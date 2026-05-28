import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Owner KPIs — heart-of-the-business snapshot for /ops landing
//
// One Promise.all of focused queries against existing Prisma models.
// Each query is wrapped in try/catch returning a sensible default so a
// missing or empty table doesn't take down the whole dashboard.
// ---------------------------------------------------------------------------

import { OwnerKpiSnapshot } from "./owner-kpi-helpers";
export * from "./owner-kpi-helpers";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const SEVEN_DAYS_MS = 7 * MS_PER_DAY;

/**
 * Capacity assumption per active provider per day. We don't have a slot
 * configuration table yet, so we approximate: each active provider exposes
 * 8 visit slots per day. Tunable in one place when a real schedule template
 * lands.
 */
const SLOTS_PER_PROVIDER_PER_DAY = 8;

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loadOwnerKpis(organizationId: string): Promise<OwnerKpiSnapshot> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - SEVEN_DAYS_MS);
  const twoWeeksAgo = new Date(now.getTime() - 2 * SEVEN_DAYS_MS);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [
    revenueThisWeekCents,
    revenuePriorWeekCents,
    denials,
    scheduleSnapshot,
    agents,
    newPatientsThisWeek,
    newPatientsPriorWeek,
    arSnapshot,
  ] = await Promise.all([
    safe(() => sumPayments(organizationId, weekAgo, now), 0),
    safe(() => sumPayments(organizationId, twoWeeksAgo, weekAgo), 0),
    safe(() => loadDenials(organizationId, now), { unresolvedCount: 0, oldestDays: null }),
    safe(() => loadScheduleSnapshot(organizationId, todayStart, todayEnd), {
      visitsToday: 0,
      openSlotsToday: 0,
      scheduleFillPct: null as number | null,
    }),
    safe(() => loadAgents(organizationId, todayStart), { running: 0, completedToday: 0 }),
    safe(
      () =>
        prisma.patient.count({
          where: { organizationId, createdAt: { gte: weekAgo, lt: now } },
        }),
      0,
    ),
    safe(
      () =>
        prisma.patient.count({
          where: { organizationId, createdAt: { gte: twoWeeksAgo, lt: weekAgo } },
        }),
      0,
    ),
    safe(() => loadArAging(organizationId, thirtyDaysAgo), {
      arAgingCents: 0,
      arPastDueCount: 0,
    }),
  ]);

  return {
    revenueThisWeekCents,
    revenuePriorWeekCents,
    denials,
    scheduleFillPct: scheduleSnapshot.scheduleFillPct,
    visitsToday: scheduleSnapshot.visitsToday,
    openSlotsToday: scheduleSnapshot.openSlotsToday,
    agents,
    newPatientsThisWeek,
    newPatientsPriorWeek,
    arAgingCents: arSnapshot.arAgingCents,
    arPastDueCount: arSnapshot.arPastDueCount,
  };
}

// ---------------------------------------------------------------------------
// Per-KPI query helpers
// ---------------------------------------------------------------------------

async function sumPayments(
  organizationId: string,
  from: Date,
  to: Date,
): Promise<number> {
  // Payment doesn't carry organizationId directly — scope through the parent
  // claim. paymentDate is the cash-posting timestamp.
  const result = await prisma.payment.aggregate({
    _sum: { amountCents: true },
    where: {
      paymentDate: { gte: from, lt: to },
      claim: { organizationId },
    },
  });
  return result._sum.amountCents ?? 0;
}

async function loadDenials(
  organizationId: string,
  now: Date,
): Promise<{ unresolvedCount: number; oldestDays: number | null }> {
  // Unresolved = resolution still "pending". Scope via parent claim's org.
  const [unresolvedCount, oldest] = await Promise.all([
    prisma.denialEvent.count({
      where: { resolution: "pending", claim: { organizationId } },
    }),
    prisma.denialEvent.findFirst({
      where: { resolution: "pending", claim: { organizationId } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  const oldestDays = oldest
    ? Math.floor((now.getTime() - oldest.createdAt.getTime()) / MS_PER_DAY)
    : null;

  return { unresolvedCount, oldestDays };
}

async function loadScheduleSnapshot(
  organizationId: string,
  todayStart: Date,
  todayEnd: Date,
): Promise<{ visitsToday: number; openSlotsToday: number; scheduleFillPct: number | null }> {
  // Appointment doesn't have organizationId — scope via patient.
  // Capacity = active providers * SLOTS_PER_PROVIDER_PER_DAY.
  const [visitsToday, activeProviders] = await Promise.all([
    prisma.appointment.count({
      where: {
        startAt: { gte: todayStart, lte: todayEnd },
        status: { in: ["requested", "confirmed", "completed"] },
        patient: { organizationId },
      },
    }),
    prisma.provider.count({ where: { organizationId, active: true } }),
  ]);

  const capacity = activeProviders * SLOTS_PER_PROVIDER_PER_DAY;
  if (capacity === 0) {
    return { visitsToday, openSlotsToday: 0, scheduleFillPct: null };
  }
  const openSlotsToday = Math.max(0, capacity - visitsToday);
  const scheduleFillPct = Math.round((visitsToday / capacity) * 100);
  return { visitsToday, openSlotsToday, scheduleFillPct };
}

async function loadAgents(
  organizationId: string,
  todayStart: Date,
): Promise<{ running: number; completedToday: number }> {
  const [running, completedToday] = await Promise.all([
    prisma.agentJob.count({
      where: { organizationId, status: { in: ["running", "claimed"] } },
    }),
    prisma.agentJob.count({
      where: {
        organizationId,
        status: "succeeded",
        completedAt: { gte: todayStart },
      },
    }),
  ]);
  return { running, completedToday };
}

async function loadArAging(
  organizationId: string,
  thirtyDaysAgo: Date,
): Promise<{ arAgingCents: number; arPastDueCount: number }> {
  // Past due = submitted >30 days ago AND still has outstanding balance
  // (status indicates claim is open: submitted/accepted/adjudicated/partial).
  const claims = await prisma.claim.findMany({
    where: {
      organizationId,
      submittedAt: { lt: thirtyDaysAgo },
      status: { in: ["submitted", "accepted", "adjudicated", "partial", "appealed"] },
    },
    select: { billedAmountCents: true, paidAmountCents: true },
  });

  let arAgingCents = 0;
  let arPastDueCount = 0;
  for (const c of claims) {
    const balance = c.billedAmountCents - c.paidAmountCents;
    if (balance > 0) {
      arAgingCents += balance;
      arPastDueCount += 1;
    }
  }
  return { arAgingCents, arPastDueCount };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

/** Run a query and swallow errors — return the fallback so the dashboard renders. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[owner-kpis] query failed, using fallback:", err);
    }
    return fallback;
  }
}
