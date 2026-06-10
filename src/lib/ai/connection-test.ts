// Phase 1 — real provider connection test (server-only).
//
// Replaces the simulated setTimeout check with an actual, cheap validation call
// to the provider using the resolved key. Uses each provider's lightweight auth
// endpoint (no token spend) so we learn whether the key truly works without
// running a completion. The key never leaves the server.

import "server-only";

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

const TIMEOUT_MS = 10_000;

interface ProviderProbe {
  url: string;
  headers: (apiKey: string) => Record<string, string>;
  requiresApiKey: boolean;
}

// Auth/metadata endpoints that validate a key without spending tokens.
const PROBES: Record<string, ProviderProbe> = {
  openrouter: {
    url: "https://openrouter.ai/api/v1/auth/key",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
    requiresApiKey: true,
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
    requiresApiKey: true,
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/models",
    headers: (k) => ({ "x-api-key": k, "anthropic-version": "2023-06-01" }),
    requiresApiKey: true,
  },
};

function interpretStatus(status: number): ConnectionTestResult {
  if (status >= 200 && status < 300) {
    return { ok: true, message: "Connection successful — key is valid." };
  }
  if (status === 401 || status === 403) {
    return { ok: false, message: "Invalid or unauthorized API key." };
  }
  if (status === 402) {
    return { ok: false, message: "Key is valid but the account is out of credit." };
  }
  if (status === 429) {
    return { ok: false, message: "Key is valid but currently rate-limited." };
  }
  return { ok: false, message: `Provider returned an unexpected status (${status}).` };
}

/**
 * Ping a provider to validate a key. `local`/`stub` (and any provider whose
 * catalog entry needs no key) short-circuit to success without a network call.
 */
export async function pingProvider(params: {
  provider: string;
  apiKey: string | null;
  requiresApiKey: boolean;
}): Promise<ConnectionTestResult> {
  const provider = params.provider.toLowerCase();
  const probe = PROBES[provider];

  if (!probe || !params.requiresApiKey) {
    return { ok: true, message: "No external key required for this provider." };
  }
  if (!params.apiKey) {
    return { ok: false, message: "No API key configured to test." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(probe.url, {
      method: "GET",
      headers: probe.headers(params.apiKey),
      signal: controller.signal,
    });
    return interpretStatus(res.status);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, message: "Connection timed out reaching the provider." };
    }
    return { ok: false, message: "Could not reach the provider (network error)." };
  } finally {
    clearTimeout(timer);
  }
}
