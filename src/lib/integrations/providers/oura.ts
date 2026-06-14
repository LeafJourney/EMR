/**
 * Oura Ring (OAuth 2.0, API v2) provider module.
 *
 * Pulls daily sleep + readiness summaries and maps Oura's 0-100 scores onto
 * Verdant's 0-10 OutcomeMetric scale (sleep -> sleep, readiness -> energy).
 * Replaces the mock `oura-parser.ts`. Real endpoints, gated on
 * OURA_CLIENT_ID/SECRET via the registry.
 */

import type { Prisma } from "@prisma/client";
import type { OAuth2ClientConfig } from "../oauth2";
import { bearerFetch } from "../oauth2";
import { ProviderAuthError } from "./errors";
import type { MappedWearableData, OAuth2ProviderModule } from "./types";

const OURA_API_BASE =
  process.env.OURA_API_BASE ?? "https://api.ouraring.com/v2/usercollection";

const NOTE_PREFIX = "Oura ";

function ouraConfig(): OAuth2ClientConfig | null {
  const clientId = process.env.OURA_CLIENT_ID?.trim();
  const clientSecret = process.env.OURA_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    authorizeUrl:
      process.env.OURA_AUTHORIZE_URL ?? "https://cloud.ouraring.com/oauth/authorize",
    tokenUrl: process.env.OURA_TOKEN_URL ?? "https://api.ouraring.com/oauth/token",
    clientId,
    clientSecret,
    scopes: ["daily", "personal"],
    tokenAuth: "body",
  };
}

interface OuraDailyRow {
  day?: string;
  score?: number;
  contributors?: Record<string, number>;
}

async function pullDaily(
  endpoint: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<OuraDailyRow[]> {
  const url = new URL(`${OURA_API_BASE}/${endpoint}`);
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  const res = await bearerFetch(url.toString(), accessToken);
  if (res.status === 401 || res.status === 403) {
    throw new ProviderAuthError(`Oura ${endpoint} unauthorized (${res.status})`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Oura ${endpoint} failed (${res.status}): ${body.slice(0, 160)}`);
  }
  const json = (await res.json().catch(() => ({}))) as { data?: OuraDailyRow[] };
  return Array.isArray(json.data) ? json.data : [];
}

/** Pure mapping of Oura daily rows to OutcomeLogs (exported for tests). */
export function mapOura(
  patientId: string,
  data: { sleep: OuraDailyRow[]; readiness: OuraDailyRow[] },
): Prisma.OutcomeLogCreateManyInput[] {
  const logs: Prisma.OutcomeLogCreateManyInput[] = [];
  for (const s of data.sleep) {
    if (!s.day || typeof s.score !== "number") continue;
    logs.push({
      patientId,
      metric: "sleep",
      value: s.score / 10,
      note: `${NOTE_PREFIX}Sleep Score: ${s.score}${s.contributors?.efficiency ? ` (Efficiency: ${s.contributors.efficiency})` : ""}`,
      loggedAt: new Date(s.day),
    });
  }
  for (const r of data.readiness) {
    if (!r.day || typeof r.score !== "number") continue;
    logs.push({
      patientId,
      metric: "energy",
      value: r.score / 10,
      note: `${NOTE_PREFIX}Readiness Score: ${r.score}`,
      loggedAt: new Date(r.day),
    });
  }
  return logs;
}

export const ouraModule: OAuth2ProviderModule = {
  slug: "oura",
  label: "Oura Ring",
  authKind: "oauth2",
  notePrefix: NOTE_PREFIX,
  observedBy: "system:oura",
  scopesForStorage: "daily personal",
  config: ouraConfig,
  async fetchAndMap(patientId, accessToken, { startDate, endDate }): Promise<MappedWearableData> {
    const [sleep, readiness] = await Promise.all([
      pullDaily("daily_sleep", accessToken, startDate, endDate),
      pullDaily("daily_readiness", accessToken, startDate, endDate),
    ]);
    return { logs: mapOura(patientId, { sleep, readiness }) };
  },
  fetchUserId: fetchOuraUserId,
};

/** Oura user id (for webhook routing): GET /personal_info -> { id }. */
export async function fetchOuraUserId(accessToken: string): Promise<string | null> {
  try {
    const res = await bearerFetch(`${OURA_API_BASE}/personal_info`, accessToken);
    if (!res.ok) return null;
    const json = (await res.json()) as { id?: string };
    return json.id ?? null;
  } catch {
    return null;
  }
}
