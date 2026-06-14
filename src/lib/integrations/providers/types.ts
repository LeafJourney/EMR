// Shared types for the wearable provider registry.

import type { Prisma } from "@prisma/client";
import type { OAuth2ClientConfig } from "../oauth2";

/** How the portal initiates a connection for a provider. */
export type ConnectKind = "oauth-redirect" | "mobile-app" | "inline";

/** Runtime availability of a provider, computed from env (server-only). */
export interface ProviderRuntime {
  /** Can the patient connect this provider right now? */
  available: boolean;
  /** "live" real provider; "mock" simulated demo; "mobile" via the app. */
  mode: "live" | "mock" | "mobile" | null;
  connectKind: ConnectKind | null;
  reason?: "not_configured" | "not_implemented" | "mobile_only";
}

export interface MappedWearableData {
  logs: Prisma.OutcomeLogCreateManyInput[];
  observations?: Prisma.ClinicalObservationCreateManyInput[];
}

/**
 * A cloud OAuth 2.0 wearable provider (Oura, Whoop, …). Encapsulates its
 * OAuth config, the scopes we persist, how it tags notes for idempotent
 * ingest, and how it pulls + maps a window of data.
 */
export interface OAuth2ProviderModule {
  slug: string;
  label: string;
  authKind: "oauth2";
  /** Note prefix identifying this provider's OutcomeLogs (idempotency key). */
  notePrefix: string;
  /** observedBy tag for any ClinicalObservations this provider writes. */
  observedBy: string;
  /** Scope string persisted on the connection for reference. */
  scopesForStorage: string;
  /** env-derived OAuth2 config; null when the provider isn't configured. */
  config(): OAuth2ClientConfig | null;
  /** Pull + map a date window (inclusive YYYY-MM-DD) into OutcomeLog rows. */
  fetchAndMap(
    patientId: string,
    accessToken: string,
    window: { startDate: string; endDate: string },
  ): Promise<MappedWearableData>;
  /** Provider-side user id, used to route inbound webhooks back to a patient. */
  fetchUserId(accessToken: string): Promise<string | null>;
}
