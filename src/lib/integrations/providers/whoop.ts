/**
 * Whoop (OAuth 2.0, API v1) provider module.
 *
 * Pulls cycles (strain), recovery, and sleep; maps recovery -> energy and
 * sleep performance -> sleep on the 0-10 scale, and records strain as a
 * ClinicalObservation (which the CDS OvertrainingRisk rule reads). Replaces
 * the mock `whoop-mapper.ts`. Gated on WHOOP_CLIENT_ID/SECRET via the registry.
 */

import type { Prisma } from "@prisma/client";
import type { OAuth2ClientConfig } from "../oauth2";
import { bearerFetch } from "../oauth2";
import { ProviderAuthError } from "./errors";
import type { MappedWearableData, OAuth2ProviderModule } from "./types";

const WHOOP_API_BASE =
  process.env.WHOOP_API_BASE ?? "https://api.prod.whoop.com/developer/v1";

const NOTE_PREFIX = "Whoop ";
const OBSERVED_BY = "system:whoop";

function whoopConfig(): OAuth2ClientConfig | null {
  const clientId = process.env.WHOOP_CLIENT_ID?.trim();
  const clientSecret = process.env.WHOOP_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    authorizeUrl:
      process.env.WHOOP_AUTHORIZE_URL ??
      "https://api.prod.whoop.com/oauth/oauth2/auth",
    tokenUrl:
      process.env.WHOOP_TOKEN_URL ??
      "https://api.prod.whoop.com/oauth/oauth2/token",
    clientId,
    clientSecret,
    // "offline" yields a refresh token.
    scopes: ["read:recovery", "read:cycles", "read:sleep", "read:profile", "offline"],
    tokenAuth: "body",
  };
}

interface WhoopRecord {
  id?: number | string;
  cycle_id?: number | string;
  start?: string;
  score?: Record<string, number>;
}

function dayOf(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

async function pull(
  endpoint: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<WhoopRecord[]> {
  const url = new URL(`${WHOOP_API_BASE}/${endpoint}`);
  url.searchParams.set("start", `${startDate}T00:00:00.000Z`);
  url.searchParams.set("end", `${endDate}T23:59:59.999Z`);
  url.searchParams.set("limit", "25");
  const res = await bearerFetch(url.toString(), accessToken);
  if (res.status === 401 || res.status === 403) {
    throw new ProviderAuthError(`Whoop ${endpoint} unauthorized (${res.status})`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Whoop ${endpoint} failed (${res.status}): ${body.slice(0, 160)}`);
  }
  const json = (await res.json().catch(() => ({}))) as { records?: WhoopRecord[] };
  return Array.isArray(json.records) ? json.records : [];
}

/** Pure mapping (exported for tests). */
export function mapWhoop(
  patientId: string,
  data: { cycles: WhoopRecord[]; recovery: WhoopRecord[]; sleep: WhoopRecord[] },
): MappedWearableData {
  const logs: Prisma.OutcomeLogCreateManyInput[] = [];
  const observations: Prisma.ClinicalObservationCreateManyInput[] = [];

  // cycle_id -> { day, strain, maxHR }
  const cycleById = new Map<string, { day: string | null; strain?: number; maxHR?: number }>();
  for (const c of data.cycles) {
    if (c.id == null) continue;
    cycleById.set(String(c.id), {
      day: dayOf(c.start),
      strain: c.score?.strain,
      maxHR: c.score?.max_heart_rate,
    });
  }

  // Recovery -> energy log (+ strain observation via its cycle).
  for (const r of data.recovery) {
    const cycle = r.cycle_id != null ? cycleById.get(String(r.cycle_id)) : undefined;
    const day = cycle?.day;
    if (!day) continue;
    const recovery = r.score?.recovery_score;
    if (typeof recovery === "number") {
      logs.push({
        patientId,
        metric: "energy",
        value: recovery / 10,
        note: `${NOTE_PREFIX}Recovery Score: ${recovery}%${r.score?.hrv_rmssd_milli ? ` (HRV: ${r.score.hrv_rmssd_milli})` : ""}`,
        loggedAt: new Date(day),
      });
    }
    if (typeof cycle?.strain === "number") {
      observations.push({
        patientId,
        observedBy: OBSERVED_BY,
        observedByKind: "agent",
        category: "lifestyle_shift",
        severity: cycle.strain > 16 ? "notable" : "info",
        summary: `Whoop Strain logged at ${cycle.strain.toFixed(1)}/21.`,
        metadata: { strain: cycle.strain, maxHR: cycle.maxHR },
        createdAt: new Date(day),
      });
    }
  }

  // Sleep performance -> sleep log.
  for (const s of data.sleep) {
    const day = dayOf(s.start);
    const perf = s.score?.sleep_performance_percentage;
    if (!day || typeof perf !== "number") continue;
    logs.push({
      patientId,
      metric: "sleep",
      value: Math.min((perf / 100) * 10, 10),
      note: `${NOTE_PREFIX}Sleep Performance: ${perf}%`,
      loggedAt: new Date(day),
    });
  }

  return { logs, observations };
}

export const whoopModule: OAuth2ProviderModule = {
  slug: "whoop",
  label: "Whoop",
  authKind: "oauth2",
  notePrefix: NOTE_PREFIX,
  observedBy: OBSERVED_BY,
  scopesForStorage: "read:recovery read:cycles read:sleep read:profile offline",
  config: whoopConfig,
  async fetchAndMap(patientId, accessToken, { startDate, endDate }): Promise<MappedWearableData> {
    const [cycles, recovery, sleep] = await Promise.all([
      pull("cycle", accessToken, startDate, endDate),
      pull("recovery", accessToken, startDate, endDate),
      pull("activity/sleep", accessToken, startDate, endDate),
    ]);
    return mapWhoop(patientId, { cycles, recovery, sleep });
  },
  fetchUserId: fetchWhoopUserId,
};

/** Whoop user id (for webhook routing): GET /user/profile/basic -> { user_id }. */
export async function fetchWhoopUserId(accessToken: string): Promise<string | null> {
  try {
    const res = await bearerFetch(`${WHOOP_API_BASE}/user/profile/basic`, accessToken);
    if (!res.ok) return null;
    const json = (await res.json()) as { user_id?: number | string };
    return json.user_id != null ? String(json.user_id) : null;
  } catch {
    return null;
  }
}
