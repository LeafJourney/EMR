// Generic helpers shared across per-state registry integrations.
//
// Real state registry APIs are heterogeneous (REST/SOAP/portal-only) and
// most require provider onboarding before credentials are issued. When a
// state has no API configured (or is paper-based), we DO NOT pretend the
// submission happened: the result is tagged `mode: "manual_stub"` with no
// confirmation number, and the UI/server must route the clinician to a
// manual filing workflow.

import type {
  RegistrySubmission,
  RegistrySubmissionResult,
} from "./types";

export interface RegistryEndpoint {
  url: string;
  apiKey: string;
}

/**
 * Resolve `STATE_REGISTRY_<CODE>_API_URL` and `STATE_REGISTRY_<CODE>_API_KEY`
 * from the environment. Returns null when either is missing — caller should
 * fall back to manual-stub mode.
 */
export function resolveRegistryEndpoint(
  stateCode: string,
): RegistryEndpoint | null {
  const code = stateCode.toUpperCase();
  const url = process.env[`STATE_REGISTRY_${code}_API_URL`];
  const apiKey = process.env[`STATE_REGISTRY_${code}_API_KEY`];
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

/**
 * Honest "nothing was transmitted" result for states without a connected
 * registry API. Deliberately carries NO confirmation number, registry
 * patient ID, or expiration date — those can only come from a real
 * registry response. `success: true` here means "the attempt was recorded
 * without error", not "the registry accepted a submission"; callers must
 * branch on `mode` before presenting any success state.
 */
export function buildManualStubResult(): RegistrySubmissionResult {
  return {
    success: true,
    mode: "manual_stub",
    submittedAt: new Date().toISOString(),
  };
}

export function buildErrorResult(errors: string[]): RegistrySubmissionResult {
  return {
    success: false,
    errors,
    submittedAt: new Date().toISOString(),
    mode: "api",
  };
}

/**
 * Generic POST submitter for state registry APIs. Each state's module can
 * call this with its specific path/body shape; in production the path is the
 * only thing that typically differs per state (auth is bearer-token API key).
 */
export async function postToRegistry(
  endpoint: RegistryEndpoint,
  path: string,
  submission: RegistrySubmission,
): Promise<RegistrySubmissionResult> {
  try {
    const res = await fetch(`${endpoint.url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${endpoint.apiKey}`,
      },
      body: JSON.stringify({
        formData: submission.formData,
        providerCredentials: submission.providerCredentials,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const errBody = await res.text();
      return buildErrorResult([
        `Registry API error: ${res.status} - ${errBody.slice(0, 500)}`,
      ]);
    }

    const result = (await res.json()) as {
      confirmationNumber?: string;
      patientId?: string;
      expirationDate?: string;
    };

    return {
      success: true,
      mode: "api",
      confirmationNumber: result.confirmationNumber,
      registryPatientId: result.patientId,
      expirationDate: result.expirationDate,
      submittedAt: new Date().toISOString(),
    };
  } catch (err) {
    return buildErrorResult([
      `Network error: ${err instanceof Error ? err.message : "Unknown error"}`,
    ]);
  }
}
