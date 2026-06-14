/**
 * Generic OAuth 2.0 sync orchestration, shared by every cloud wearable
 * provider (Oura, Whoop, …). Resolves credentials, refreshes the access token
 * when it's expired (or after a 401), pulls + maps a trailing window via the
 * provider module, writes it idempotently, and fires CDS.
 *
 * Token storage on DeviceConnection (reusing existing columns):
 *   accessToken       -> encrypted OAuth2 access token
 *   accessTokenSecret -> encrypted OAuth2 refresh token
 *   tokenExpiresAt    -> access-token expiry
 */

import { prisma } from "@/lib/db/prisma";
import { refreshAccessToken } from "../oauth2";
import { encryptToken, decryptTokenSafe } from "../token-crypto";
import {
  ingestOutcomeLogs,
  ingestObservations,
  evaluateWearableCDS,
} from "../ingest";
import { ProviderAuthError, ProviderReconnectError } from "./errors";
import type { OAuth2ProviderModule } from "./types";

/** Trailing days pulled on a connect / manual sync. */
export const OAUTH2_BACKFILL_DAYS = 7;

export interface OAuth2ConnectionLike {
  patientId: string;
  provider: string;
  accessToken: string | null; // encrypted
  accessTokenSecret: string | null; // encrypted refresh token
  tokenExpiresAt: Date | null;
}

function backfillWindow(days = OAUTH2_BACKFILL_DAYS): {
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

/** Refresh the access token and persist the new credentials. Returns it. */
async function refreshAndPersist(
  module: OAuth2ProviderModule,
  conn: OAuth2ConnectionLike,
  refreshToken: string,
): Promise<string> {
  const cfg = module.config();
  if (!cfg) throw new ProviderReconnectError();
  const fresh = await refreshAccessToken(cfg, refreshToken);
  await prisma.deviceConnection.update({
    where: {
      patientId_provider: { patientId: conn.patientId, provider: conn.provider },
    },
    data: {
      accessToken: encryptToken(fresh.accessToken),
      // Some providers rotate the refresh token; keep the old one if not.
      accessTokenSecret: encryptToken(fresh.refreshToken ?? refreshToken),
      tokenExpiresAt: fresh.expiresAt,
      lastError: null,
    },
  });
  return fresh.accessToken;
}

/**
 * Pull + ingest a trailing window for an OAuth2 connection. Throws
 * ProviderReconnectError when credentials are unusable.
 */
export async function syncOAuth2Connection(
  module: OAuth2ProviderModule,
  conn: OAuth2ConnectionLike,
): Promise<number> {
  let accessToken = decryptTokenSafe(conn.accessToken);
  const refreshToken = decryptTokenSafe(conn.accessTokenSecret);
  if (!accessToken && !refreshToken) throw new ProviderReconnectError();

  // Proactively refresh if expired (or about to be) and we can.
  const expiringSoon =
    !accessToken ||
    (conn.tokenExpiresAt != null &&
      conn.tokenExpiresAt.getTime() < Date.now() + 60_000);
  if (expiringSoon && refreshToken) {
    accessToken = await refreshAndPersist(module, conn, refreshToken);
  }
  if (!accessToken) throw new ProviderReconnectError();

  const window = backfillWindow();
  let mapped;
  try {
    mapped = await module.fetchAndMap(conn.patientId, accessToken, window);
  } catch (err) {
    // Reactive refresh on a 401/403, then one retry.
    if (err instanceof ProviderAuthError && refreshToken) {
      accessToken = await refreshAndPersist(module, conn, refreshToken);
      mapped = await module.fetchAndMap(conn.patientId, accessToken, window);
    } else if (err instanceof ProviderAuthError) {
      throw new ProviderReconnectError();
    } else {
      throw err;
    }
  }

  const count = await ingestOutcomeLogs(conn.patientId, mapped.logs, {
    prefix: module.notePrefix,
  });
  if (mapped.observations?.length) {
    await ingestObservations(conn.patientId, mapped.observations, {
      observedBy: module.observedBy,
    });
  }
  await evaluateWearableCDS(conn.patientId);
  return count;
}
