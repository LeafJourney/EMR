/**
 * Normalize mobile-app health payloads (Apple HealthKit / Android Health
 * Connect) into OutcomeLog rows + ClinicalObservations.
 *
 * Both stores are on-device; the LeafJourney app reads them (with the user's
 * permission) and POSTs them to /api/mobile/biometrics/sync. We aggregate
 * per UTC day so loggedAt is a stable idempotency key for the shared ingest.
 *
 *   sleep   -> OutcomeMetric.sleep   (hours, capped at 8h = 10)
 *   steps   -> OutcomeMetric.energy  (capped at 10k steps = 10)
 *   HRV     -> ClinicalObservation   (informational trend)
 */

import type { Prisma } from "@prisma/client";
import type { MappedWearableData } from "../providers/types";
import type { MobileProvider } from "./config";

const PREFIX: Record<MobileProvider, string> = {
  "apple-health": "Apple Health ",
  android: "Android Health ",
};

const OBSERVED_BY: Record<MobileProvider, string> = {
  "apple-health": "system:healthkit",
  android: "system:health-connect",
};

function dayKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function hoursBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000;
}

interface SleepSegment {
  startTime: string;
  endTime: string;
}
interface StepSample {
  startTime: string;
  count: number;
}
interface HrvSample {
  time: string;
  milliseconds: number;
}

export interface NormalizedMobileInput {
  sleepSegments?: SleepSegment[];
  steps?: StepSample[];
  hrv?: HrvSample[];
}

/**
 * Map a provider-agnostic, pre-extracted payload into OutcomeLog rows +
 * observations. The route is responsible for converting each platform's raw
 * shape (HKCategorySample / Health Connect records) into NormalizedMobileInput.
 */
export function mapMobile(
  patientId: string,
  provider: MobileProvider,
  input: NormalizedMobileInput,
): MappedWearableData {
  const prefix = PREFIX[provider];
  const logs: Prisma.OutcomeLogCreateManyInput[] = [];
  const observations: Prisma.ClinicalObservationCreateManyInput[] = [];

  // Sleep: total asleep hours per day.
  const sleepByDay = new Map<string, number>();
  for (const seg of input.sleepSegments ?? []) {
    const day = dayKey(seg.endTime);
    const hrs = hoursBetween(seg.startTime, seg.endTime);
    if (!day || !(hrs > 0)) continue;
    sleepByDay.set(day, (sleepByDay.get(day) ?? 0) + hrs);
  }
  for (const [day, hrs] of sleepByDay) {
    logs.push({
      patientId,
      metric: "sleep",
      value: Number(Math.min((hrs / 8) * 10, 10).toFixed(1)),
      note: `${prefix}Sleep (${hrs.toFixed(1)} hrs)`,
      loggedAt: new Date(day),
    });
  }

  // Steps: total per day -> energy proxy.
  const stepsByDay = new Map<string, number>();
  for (const s of input.steps ?? []) {
    const day = dayKey(s.startTime);
    if (!day || !(s.count > 0)) continue;
    stepsByDay.set(day, (stepsByDay.get(day) ?? 0) + s.count);
  }
  for (const [day, steps] of stepsByDay) {
    logs.push({
      patientId,
      metric: "energy",
      value: Number(Math.min((steps / 10_000) * 10, 10).toFixed(1)),
      note: `${prefix}Activity (${steps} steps)`,
      loggedAt: new Date(day),
    });
  }

  // HRV: latest per day -> informational observation.
  const hrvByDay = new Map<string, number>();
  for (const h of input.hrv ?? []) {
    const day = dayKey(h.time);
    if (!day || !(h.milliseconds > 0)) continue;
    hrvByDay.set(day, h.milliseconds);
  }
  for (const [day, ms] of hrvByDay) {
    observations.push({
      patientId,
      observedBy: OBSERVED_BY[provider],
      observedByKind: "agent",
      category: "lifestyle_shift",
      severity: "info",
      summary: `${prefix.trim()} recorded an HRV of ${ms} ms.`,
      metadata: { hrv: ms },
      createdAt: new Date(day),
    });
  }

  return { logs, observations };
}

export const mobileObservedBy = OBSERVED_BY;
export const mobileNotePrefix = PREFIX;

function arr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function n(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Apple HealthKit export -> normalized input. */
export function extractHealthKit(body: Record<string, unknown>): NormalizedMobileInput {
  const out: NormalizedMobileInput = { sleepSegments: [], steps: [], hrv: [] };
  for (const s of arr(body.categorySamples)) {
    if (
      s.type === "HKCategoryTypeIdentifierSleepAnalysis" &&
      n(s.value) !== 0 &&
      str(s.startDate) &&
      str(s.endDate)
    ) {
      out.sleepSegments!.push({ startTime: s.startDate as string, endTime: s.endDate as string });
    }
  }
  for (const s of arr(body.quantitySamples)) {
    const value = n(s.value);
    if (s.type === "HKQuantityTypeIdentifierStepCount" && value != null && str(s.startDate)) {
      out.steps!.push({ startTime: s.startDate as string, count: value });
    } else if (
      s.type === "HKQuantityTypeIdentifierHeartRateVariabilitySDNN" &&
      value != null &&
      str(s.endDate)
    ) {
      out.hrv!.push({ time: s.endDate as string, milliseconds: value });
    }
  }
  return out;
}

/** Android Health Connect records -> normalized input. */
export function extractHealthConnect(body: Record<string, unknown>): NormalizedMobileInput {
  const out: NormalizedMobileInput = { sleepSegments: [], steps: [], hrv: [] };
  for (const r of arr(body.records)) {
    const type = str(r.recordType);
    const start = str(r.startTime);
    const end = str(r.endTime) ?? start;
    const value = n(r.value ?? r.count ?? r.heartRateVariabilityMillis);
    if (type === "SleepSession" && start && end) {
      out.sleepSegments!.push({ startTime: start, endTime: end });
    } else if (type === "Steps" && start && value != null) {
      out.steps!.push({ startTime: start, count: value });
    } else if (type === "HeartRateVariabilityRmssd" && (end ?? start) && value != null) {
      out.hrv!.push({ time: (end ?? start) as string, milliseconds: value });
    }
  }
  return out;
}

/** Map an inbound `source` to its DeviceConnection provider slug. */
export function providerForMobileSource(source: string): MobileProvider | null {
  if (source === "apple-health") return "apple-health";
  if (source === "health-connect" || source === "android") return "android";
  return null;
}
