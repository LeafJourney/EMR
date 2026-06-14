/**
 * Garmin sync orchestration — the single entry point every caller (connect
 * backfill, "Sync now", webhook) funnels through. It resolves the mode
 * guardrail, fetches (live) or simulates (mock) the window, writes it
 * idempotently, and fires CDS. It NEVER fabricates data in "disabled" mode.
 */

import {
  resolveGarminMode,
  garminConsumerCredentials,
} from "./config";
import { garminHealthClient, mockGarminPayload, GarminAuthError } from "./client";
import type { OAuthTokenPair } from "./oauth";
import { decryptTokenSafe } from "../token-crypto";
import {
  ingestGarminPayload,
  evaluateGarminCDS,
  type GarminPayload,
} from "../garmin-vitals";

/** Trailing days of history pulled on a Garmin connect / manual sync. */
export const GARMIN_BACKFILL_DAYS = 7;

/** Raised when a live connection has no usable token — the patient must
 *  re-authorize. Distinct from a transient network failure. */
export class GarminReconnectError extends Error {
  constructor(message = "Garmin connection needs to be re-authorized") {
    super(message);
    this.name = "GarminReconnectError";
  }
}

export interface GarminConnectionLike {
  patientId: string;
  accessToken: string | null; // encrypted envelope
  accessTokenSecret: string | null; // encrypted envelope
}

/** Decrypt a stored live token pair, or null if absent/undecryptable. */
export function loadLiveToken(conn: GarminConnectionLike): OAuthTokenPair | null {
  const token = decryptTokenSafe(conn.accessToken);
  const tokenSecret = decryptTokenSafe(conn.accessTokenSecret);
  if (!token || !tokenSecret) return null;
  return { token, tokenSecret };
}

function backfillWindow(days = GARMIN_BACKFILL_DAYS): {
  startDate: string;
  endDate: string;
} {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

/**
 * Pull (or simulate) the trailing window for a connection and ingest it,
 * then run CDS. Returns the number of OutcomeLogs written.
 *
 * Throws:
 *   - Error("GARMIN_DISABLED") if the integration isn't enabled (guardrail).
 *   - GarminReconnectError if a live token is missing/expired.
 *   - GarminAuthError if Garmin rejects the token mid-fetch.
 *   - other Errors on transient network failure (caller surfaces lastError).
 */
export async function syncGarminConnection(
  conn: GarminConnectionLike,
  opts: { days?: number } = {},
): Promise<number> {
  const mode = resolveGarminMode();
  if (mode === "disabled") {
    // Hard guardrail: never write fabricated biometrics to a real chart.
    throw new Error("GARMIN_DISABLED");
  }

  const { startDate, endDate } = backfillWindow(opts.days);
  let payload: GarminPayload;
  let simulated: boolean;

  if (mode === "mock") {
    payload = mockGarminPayload(startDate, endDate);
    simulated = true;
  } else {
    const token = loadLiveToken(conn);
    if (!token) throw new GarminReconnectError();
    payload = await garminHealthClient.fetchVitals(token, startDate, endDate);
    simulated = false;
  }

  const recordsSynced = await ingestGarminPayload(conn.patientId, payload, {
    simulated,
  });
  await evaluateGarminCDS(conn.patientId);
  return recordsSynced;
}

/** Re-export for callers that branch on auth failures. */
export { GarminAuthError, garminConsumerCredentials };
