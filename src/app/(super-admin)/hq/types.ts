// Pure types + pure helpers for the HQ fleet aggregates layer (EMR-731).
// No server imports — must be safe to consume from unit tests and from
// any client component that wants to type-narrow on a loader response.

export interface FleetCounts {
  practicesLive: number;
  practicesOnboarding: number;
  practicesStuck: number;
  providersActive: number;
  patientsActive: number;
}

export interface FleetRevenue {
  billedCentsMTD: number;
  collectedCentsMTD: number;
  gmvCentsMTD: number;
  billedCentsPrevMonth: number;
  collectedCentsPrevMonth: number;
  gmvCentsPrevMonth: number;
}

export interface FleetDailyPoint {
  date: string;
  claims: number;
  charges: number;
  encounters: number;
  billedCents: number;
  newPatients: number;
}

export interface OnboardingFunnelStage {
  status: string;
  count: number;
  medianHoursInStage: number;
}

export interface ModalityMixRow {
  modality: string;
  practiceCount: number;
}

export interface SpecialtyMixRow {
  specialty: string;
  manifestVersion: string;
  practiceCount: number;
}

export interface SpecialtyDriftRow {
  specialty: string;
  latestVersion: string;
  currentVersion: string;
  practiceCount: number;
}

export type TopPracticesMetric = "claims" | "billed" | "patientGrowth";

export interface TopPracticeRow {
  organizationId: string;
  practiceName: string;
  metric: number;
  momDelta: number;
}

export interface RecentActivityRow {
  id: string;
  at: string;
  actorUserId: string;
  actorEmail: string | null;
  organizationId: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  deeplink: string;
}

export interface HqDashboardSnapshot {
  counts: FleetCounts;
  revenue: FleetRevenue;
  dailySeries: FleetDailyPoint[];
  onboardingFunnel: OnboardingFunnelStage[];
  modalityMix: ModalityMixRow[];
  specialtyMix: SpecialtyMixRow[];
  specialtyDrift: SpecialtyDriftRow[];
  topByClaims: TopPracticeRow[];
  topByRevenue: TopPracticeRow[];
  topByPatientGrowth: TopPracticeRow[];
  recentActivity: RecentActivityRow[];
}

/**
 * Month-over-month delta percent: (current - prev) / prev * 100, clamped to
 * 0 when prev is 0 and current is 0, and to Infinity (encoded as a finite
 * sentinel +/-100 when prev is 0 but current is not). UI renders a "—"
 * dash for the Infinity case via the `isFinite` check.
 */
export function momDelta(current: number, prev: number): number {
  if (prev === 0) {
    if (current === 0) return 0;
    return current > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }
  return ((current - prev) / prev) * 100;
}

/**
 * Zero-fills a daily-bucketed map into a `days`-long array ending on `endUtc`.
 * Dates are emitted as YYYY-MM-DD in UTC.
 */
export function zeroFillDailySeries(
  buckets: Map<string, Omit<FleetDailyPoint, "date">>,
  days: number,
  endUtc: Date = new Date(),
): FleetDailyPoint[] {
  const out: FleetDailyPoint[] = [];
  const end = new Date(
    Date.UTC(
      endUtc.getUTCFullYear(),
      endUtc.getUTCMonth(),
      endUtc.getUTCDate(),
    ),
  );
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const row = buckets.get(key);
    out.push({
      date: key,
      claims: row?.claims ?? 0,
      charges: row?.charges ?? 0,
      encounters: row?.encounters ?? 0,
      billedCents: row?.billedCents ?? 0,
      newPatients: row?.newPatients ?? 0,
    });
  }
  return out;
}

/**
 * A `PracticeConfiguration` is "stuck" when its status is non-terminal
 * (draft) and `updatedAt` is older than the threshold.
 */
export function isStuckConfig(
  status: string,
  updatedAt: Date,
  now: Date = new Date(),
  staleHours: number = 24,
): boolean {
  if (status === "published" || status === "archived") return false;
  const ageMs = now.getTime() - updatedAt.getTime();
  return ageMs > staleHours * 60 * 60 * 1000;
}

/**
 * Median in milliseconds for a list of durations. Returns 0 for an empty list.
 */
export function medianMs(durationsMs: number[]): number {
  if (durationsMs.length === 0) return 0;
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}
