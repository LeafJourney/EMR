/**
 * Garmin Health API webhook parsing (push + ping).
 *
 * Garmin's Health API is push-based. After a user authorizes us, Garmin
 * delivers summaries to our registered webhook in one of two shapes:
 *
 *   - PUSH: the summary objects themselves, grouped by type, each carrying a
 *     `userId`. We map and ingest them directly.
 *   - PING: lightweight notifications carrying `userId` + `callbackURL` (no
 *     summary fields). We must GET the callbackURL (OAuth-signed with that
 *     user's token) to fetch the actual data.
 *
 * This module is the PURE parse/grouping step — no DB, no network — so it can
 * be unit-tested against representative payloads. The route does the DB
 * lookups and ingestion.
 */

import { parseGarminDaily, parseGarminSleep } from "./client";
import type {
  GarminPayload,
  GarminDailySummary,
  GarminSleepSummary,
} from "../garmin-vitals";

export interface GarminPushGroup {
  userId: string;
  payload: GarminPayload;
}

export interface GarminPingEntry {
  userId: string;
  callbackURL: string;
  summaryType: "dailies" | "sleeps";
}

export interface ParsedGarminWebhook {
  pushes: GarminPushGroup[];
  pings: GarminPingEntry[];
}

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

/**
 * Split an inbound Garmin webhook body into per-user pushes (with mapped
 * summaries) and pings (callbackURLs to fetch). Unknown summary types are
 * ignored. Entries without a userId are dropped.
 */
export function parseGarminWebhook(body: unknown): ParsedGarminWebhook {
  const root = (body ?? {}) as Record<string, unknown>;

  const acc = new Map<
    string,
    { dailies: GarminDailySummary[]; sleeps: GarminSleepSummary[] }
  >();
  const ensure = (userId: string) => {
    let entry = acc.get(userId);
    if (!entry) {
      entry = { dailies: [], sleeps: [] };
      acc.set(userId, entry);
    }
    return entry;
  };

  const pingKeys = new Set<string>();
  const pings: GarminPingEntry[] = [];
  const recordPing = (
    userId: string,
    callbackURL: string,
    summaryType: "dailies" | "sleeps",
  ) => {
    const key = [userId, summaryType, callbackURL].join(" ");
    if (pingKeys.has(key)) return;
    pingKeys.add(key);
    pings.push({ userId, callbackURL, summaryType });
  };

  for (const raw of asArray(root.dailies)) {
    const userId = typeof raw.userId === "string" ? raw.userId : "";
    if (!userId) continue;
    if (typeof raw.callbackURL === "string" && raw.callbackURL) {
      recordPing(userId, raw.callbackURL, "dailies");
      continue;
    }
    const d = parseGarminDaily(raw);
    if (d) ensure(userId).dailies.push(d);
  }

  for (const raw of asArray(root.sleeps)) {
    const userId = typeof raw.userId === "string" ? raw.userId : "";
    if (!userId) continue;
    if (typeof raw.callbackURL === "string" && raw.callbackURL) {
      recordPing(userId, raw.callbackURL, "sleeps");
      continue;
    }
    const s = parseGarminSleep(raw);
    if (s) ensure(userId).sleeps.push(s);
  }

  const pushes: GarminPushGroup[] = [];
  for (const [userId, entry] of acc) {
    if (entry.dailies.length === 0 && entry.sleeps.length === 0) continue;
    pushes.push({
      userId,
      payload: { dailies: entry.dailies, sleeps: entry.sleeps },
    });
  }

  return { pushes, pings };
}
