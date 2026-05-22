"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { getLocalDayBounds } from "@/lib/utils/timezone";

export interface FlowTrendItem {
  label: string;
  careTime: number;
  carryover: number;
}

export interface DiscoveryTrendItem {
  label: string;
  count: number;
}

export async function getClinicalFlowTrendAction(
  span: "week" | "month" | "year"
): Promise<{ ok: true; data: FlowTrendItem[] } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    if (!user.organizationId) return { ok: false, error: "No organizationId found." };

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { timeZone: true },
    });
    const timeZone = org?.timeZone || "America/Los_Angeles";

    const provider = user.roles.includes("clinician")
      ? await prisma.provider.findFirst({
          where: { userId: user.id, organizationId: user.organizationId },
          select: { id: true },
        })
      : null;

    let rangeStart: Date;
    let rangeEnd: Date;
    const now = new Date();

    if (span === "week") {
      const pastDate = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      rangeStart = getLocalDayBounds(timeZone, pastDate).startOfDay;
      rangeEnd = getLocalDayBounds(timeZone, now).endOfDay;
    } else if (span === "month") {
      const pastDate = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      rangeStart = getLocalDayBounds(timeZone, pastDate).startOfDay;
      rangeEnd = getLocalDayBounds(timeZone, now).endOfDay;
    } else {
      // 12 months range
      const pastDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      rangeStart = getLocalDayBounds(timeZone, pastDate).startOfDay;
      rangeEnd = getLocalDayBounds(timeZone, now).endOfDay;
    }

    const encounters = await prisma.encounter.findMany({
      where: {
        organizationId: user.organizationId,
        scheduledFor: { gte: rangeStart, lt: rangeEnd },
        ...(provider ? { providerId: provider.id } : {}),
      },
      select: {
        startedAt: true,
        completedAt: true,
        chartingCompletedAt: true,
        scheduledFor: true,
      },
    });

    const data: FlowTrendItem[] = [];

    if (span === "week" || span === "month") {
      const daysCount = span === "week" ? 7 : 30;
      const dailyMap: Record<string, { label: string; careTime: number; carryover: number }> = {};

      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayLabelFormatter = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
        const keyFormatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
        const label = dayLabelFormatter.format(d);
        const key = keyFormatter.format(d);

        dailyMap[key] = { label, careTime: 0, carryover: 0 };
      }

      for (const e of encounters) {
        if (!e.scheduledFor) continue;
        const keyFormatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
        const key = keyFormatter.format(e.scheduledFor);
        if (dailyMap[key]) {
          if (e.startedAt && e.completedAt) {
            const careMs = e.completedAt.getTime() - e.startedAt.getTime();
            dailyMap[key].careTime += Math.max(0, Math.round(careMs / 60000));

            if (e.chartingCompletedAt) {
              const carryoverMs = e.chartingCompletedAt.getTime() - e.completedAt.getTime();
              dailyMap[key].carryover += Math.max(0, Math.round(carryoverMs / 60000));
            }
          }
        }
      }

      data.push(...Object.values(dailyMap));
    } else {
      // monthly
      const monthlyMap: Record<string, { label: string; careTime: number; carryover: number }> = {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthLabelFormatter = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", year: "2-digit" });
        const keyFormatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" });
        const label = monthLabelFormatter.format(d);
        const key = keyFormatter.format(d);

        monthlyMap[key] = { label, careTime: 0, carryover: 0 };
      }

      for (const e of encounters) {
        if (!e.scheduledFor) continue;
        const keyFormatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" });
        const key = keyFormatter.format(e.scheduledFor);
        if (monthlyMap[key]) {
          if (e.startedAt && e.completedAt) {
            const careMs = e.completedAt.getTime() - e.startedAt.getTime();
            monthlyMap[key].careTime += Math.max(0, Math.round(careMs / 60000));

            if (e.chartingCompletedAt) {
              const carryoverMs = e.chartingCompletedAt.getTime() - e.completedAt.getTime();
              monthlyMap[key].carryover += Math.max(0, Math.round(carryoverMs / 60000));
            }
          }
        }
      }

      data.push(...Object.values(monthlyMap));
    }

    return { ok: true, data };
  } catch (error: any) {
    console.error("getClinicalFlowTrendAction failed:", error);
    return { ok: false, error: error.message || "Failed to fetch clinical flow trend." };
  }
}

export async function getClinicalDiscoveryTrendAction(
  span: "week" | "month" | "year"
): Promise<{ ok: true; data: DiscoveryTrendItem[] } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    if (!user.organizationId) return { ok: false, error: "No organizationId found." };

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { timeZone: true },
    });
    const timeZone = org?.timeZone || "America/Los_Angeles";

    let rangeStart: Date;
    let rangeEnd: Date;
    const now = new Date();

    if (span === "week") {
      const pastDate = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      rangeStart = getLocalDayBounds(timeZone, pastDate).startOfDay;
      rangeEnd = getLocalDayBounds(timeZone, now).endOfDay;
    } else if (span === "month") {
      const pastDate = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      rangeStart = getLocalDayBounds(timeZone, pastDate).startOfDay;
      rangeEnd = getLocalDayBounds(timeZone, now).endOfDay;
    } else {
      // 12 months range
      const pastDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      rangeStart = getLocalDayBounds(timeZone, pastDate).startOfDay;
      rangeEnd = getLocalDayBounds(timeZone, now).endOfDay;
    }

    const observations = await prisma.clinicalObservation.findMany({
      where: {
        patient: { organizationId: user.organizationId, deletedAt: null },
        createdAt: { gte: rangeStart, lt: rangeEnd },
      },
      select: {
        createdAt: true,
      },
    });

    const data: DiscoveryTrendItem[] = [];

    if (span === "week" || span === "month") {
      const daysCount = span === "week" ? 7 : 30;
      const dailyMap: Record<string, { label: string; count: number }> = {};

      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayLabelFormatter = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
        const keyFormatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
        const label = dayLabelFormatter.format(d);
        const key = keyFormatter.format(d);

        dailyMap[key] = { label, count: 0 };
      }

      for (const o of observations) {
        const keyFormatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
        const key = keyFormatter.format(o.createdAt);
        if (dailyMap[key]) {
          dailyMap[key].count++;
        }
      }

      data.push(...Object.values(dailyMap));
    } else {
      // monthly
      const monthlyMap: Record<string, { label: string; count: number }> = {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthLabelFormatter = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", year: "2-digit" });
        const keyFormatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" });
        const label = monthLabelFormatter.format(d);
        const key = keyFormatter.format(d);

        monthlyMap[key] = { label, count: 0 };
      }

      for (const o of observations) {
        const keyFormatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" });
        const key = keyFormatter.format(o.createdAt);
        if (monthlyMap[key]) {
          monthlyMap[key].count++;
        }
      }

      data.push(...Object.values(monthlyMap));
    }

    return { ok: true, data };
  } catch (error: any) {
    console.error("getClinicalDiscoveryTrendAction failed:", error);
    return { ok: false, error: error.message || "Failed to fetch clinical discovery trend." };
  }
}
