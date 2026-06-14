/**
 * Garmin Health/Wellness API — real HTTP client.
 *
 * All requests are OAuth 1.0a-signed (see ./oauth). The Health API caps each
 * direct summary pull at a 24h upload-time window, so fetchVitals chunks the
 * requested range day-by-day and aggregates. Parsing is defensive: Garmin's
 * summary objects vary by device/firmware and routinely omit fields, so we
 * coalesce missing values rather than throw — a single odd day must not fail
 * an entire sync.
 *
 * The mock generator at the bottom is the ONLY source of simulated data and
 * is reachable only via resolveGarminMode() === "mock" (non-prod opt-in).
 */

import { GARMIN_ENDPOINTS } from "./config";
import { signedFetch, type OAuthTokenPair } from "./oauth";
import type {
  GarminPayload,
  GarminDailySummary,
  GarminSleepSummary,
} from "../garmin-vitals";

const DAY_SECONDS = 86_400;

function epochSeconds(date: string, endOfDay = false): number {
  const iso = endOfDay ? `${date}T23:59:59.999Z` : `${date}T00:00:00.000Z`;
  return Math.floor(new Date(iso).getTime() / 1000);
}

/** Yield ≤24h [start,end] upload windows covering [startEpoch, endEpoch]. */
function* dayWindows(
  startEpoch: number,
  endEpoch: number,
): Generator<[number, number]> {
  let s = startEpoch;
  while (s < endEpoch) {
    const e = Math.min(s + DAY_SECONDS, endEpoch);
    yield [s, e];
    s = e;
  }
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

async function pullSummaries(
  endpoint: string,
  token: OAuthTokenPair,
  startEpoch: number,
  endEpoch: number,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const [s, e] of dayWindows(startEpoch, endEpoch)) {
    const res = await signedFetch("GET", `${GARMIN_ENDPOINTS.apiBase}${endpoint}`, token, {
      uploadStartTimeInSeconds: String(s),
      uploadEndTimeInSeconds: String(e),
    });
    if (res.status === 401 || res.status === 403) {
      // Token revoked/invalid — surface as a typed error so the caller can
      // flag the connection as needing re-authorization.
      const body = await res.text().catch(() => "");
      throw new GarminAuthError(
        `Garmin ${endpoint} unauthorized (${res.status}): ${body.slice(0, 120)}`,
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Garmin ${endpoint} failed (${res.status}): ${body.slice(0, 160)}`);
    }
    const json = (await res.json().catch(() => [])) as unknown;
    if (Array.isArray(json)) out.push(...(json as Record<string, unknown>[]));
  }
  return out;
}

/** Raised when Garmin rejects our token; callers convert to "reconnect". */
export class GarminAuthError extends Error {}

export function parseGarminDaily(
  raw: Record<string, unknown>,
): GarminDailySummary | null {
  const calendarDate = (raw.calendarDate as string) ?? "";
  if (!calendarDate) return null;
  return {
    calendarDate,
    averageHeartRateInBeatsPerMinute: num(raw.averageHeartRateInBeatsPerMinute),
    averageStressLevel: num(raw.averageStressLevel),
    maxStressLevel: num(raw.maxStressLevel),
    bodyBatteryLowestValue: num(
      raw.bodyBatteryLowestValue ?? raw.lowStressDurationInSeconds,
    ),
    bodyBatteryHighestValue: num(raw.bodyBatteryHighestValue),
  };
}

export function parseGarminSleep(
  raw: Record<string, unknown>,
): GarminSleepSummary | null {
  const calendarDate = (raw.calendarDate as string) ?? "";
  if (!calendarDate) return null;
  // Sleep score lives under different keys across API versions.
  const scoreObj = raw.overallSleepScore as { value?: number } | undefined;
  const sleepScore = num(
    scoreObj?.value ?? (raw.sleepQualityScore as number) ?? (raw.sleepScore as number),
  );
  return {
    calendarDate,
    durationInSeconds: num(raw.durationInSeconds),
    sleepScore,
  };
}

/** Keep the latest summary per calendarDate (later windows win). */
function dedupeByDate<T extends { calendarDate: string }>(items: T[]): T[] {
  const byDate = new Map<string, T>();
  for (const item of items) byDate.set(item.calendarDate, item);
  return [...byDate.values()];
}

export const garminHealthClient = {
  /**
   * Fetch dailies (Body Battery / stress / HR) + sleeps for [startDate, endDate]
   * (inclusive YYYY-MM-DD), normalised into a GarminPayload.
   */
  async fetchVitals(
    token: OAuthTokenPair,
    startDate: string,
    endDate: string,
  ): Promise<GarminPayload> {
    const startEpoch = epochSeconds(startDate);
    const endEpoch = epochSeconds(endDate, true);

    const [dailiesRaw, sleepsRaw] = await Promise.all([
      pullSummaries("/dailies", token, startEpoch, endEpoch),
      pullSummaries("/sleeps", token, startEpoch, endEpoch),
    ]);

    return {
      dailies: dedupeByDate(
        dailiesRaw
          .map(parseGarminDaily)
          .filter((d): d is GarminDailySummary => d !== null),
      ),
      sleeps: dedupeByDate(
        sleepsRaw
          .map(parseGarminSleep)
          .filter((s): s is GarminSleepSummary => s !== null),
      ),
    };
  },

  /** Garmin "User API id" — the stable per-user id we key webhook pushes on. */
  async fetchUserId(token: OAuthTokenPair): Promise<string> {
    const res = await signedFetch("GET", `${GARMIN_ENDPOINTS.apiBase}/user/id`, token);
    if (!res.ok) {
      throw new Error(`Garmin user/id failed (${res.status})`);
    }
    const json = (await res.json()) as { userId?: string };
    if (!json.userId) throw new Error("Garmin user/id: missing userId");
    return json.userId;
  },

  /**
   * Ask Garmin to (re)push historic summaries for [startDate, endDate] to our
   * webhook (the Backfill API). Best-effort: backfill is async and bounded by
   * Garmin, so we never let a backfill failure fail the connect flow.
   */
  async requestBackfill(
    token: OAuthTokenPair,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    const startEpoch = String(epochSeconds(startDate));
    const endEpoch = String(epochSeconds(endDate, true));
    for (const summary of ["dailies", "sleeps"] as const) {
      try {
        await signedFetch(
          "GET",
          `${GARMIN_ENDPOINTS.apiBase}/backfill/${summary}`,
          token,
          { summaryStartTimeInSeconds: startEpoch, summaryEndTimeInSeconds: endEpoch },
        );
      } catch (err) {
        console.error(`[Garmin] backfill ${summary} request failed:`, err);
      }
    }
  },

  /**
   * Revoke our access to the user's Garmin data (called on disconnect).
   * Best-effort: a failed deregistration must not block the local disconnect.
   */
  async deregister(token: OAuthTokenPair): Promise<void> {
    try {
      await signedFetch("DELETE", `${GARMIN_ENDPOINTS.apiBase}/user/registration`, token);
    } catch (err) {
      console.error("[Garmin] deregistration failed (continuing):", err);
    }
  },
};

/**
 * Deterministic simulated payload for mock mode (local dev / demos). Mirrors
 * the historical hard-coded values from #678, but is now reachable ONLY via
 * resolveGarminMode() === "mock", and everything it produces is tagged
 * "(SIMULATED)" downstream by ingestGarminPayload.
 */
export function mockGarminPayload(
  startDate: string,
  _endDate: string,
): GarminPayload {
  return {
    dailies: [
      {
        calendarDate: startDate,
        averageHeartRateInBeatsPerMinute: 65,
        averageStressLevel: 42,
        maxStressLevel: 88,
        bodyBatteryLowestValue: 12,
        bodyBatteryHighestValue: 95,
      },
    ],
    sleeps: [
      {
        calendarDate: startDate,
        durationInSeconds: 28_800, // 8h
        sleepScore: 85,
      },
    ],
  };
}
