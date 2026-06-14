/**
 * Generic OAuth 2.0 (authorization-code) helper, shared by the cloud-API
 * wearable integrations (Oura, Whoop, …). Garmin is OAuth 1.0a and uses its
 * own module. This is pure protocol — no DB, no policy. Availability gating
 * lives in providers/registry.ts.
 */

export interface OAuth2ClientConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  /** How client credentials reach the token endpoint: HTTP Basic or in body. */
  tokenAuth: "basic" | "body";
}

export interface OAuth2TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** Absolute expiry, derived from the response's expires_in. */
  expiresAt: Date | null;
  scope: string | null;
}

export function buildAuthorizeUrl(
  cfg: OAuth2ClientConfig,
  opts: { redirectUri: string; state: string },
): string {
  const u = new URL(cfg.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("scope", cfg.scopes.join(" "));
  u.searchParams.set("state", opts.state);
  return u.toString();
}

async function tokenRequest(
  cfg: OAuth2ClientConfig,
  params: Record<string, string>,
): Promise<OAuth2TokenSet> {
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (cfg.tokenAuth === "basic") {
    headers.Authorization =
      "Basic " +
      Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  } else {
    body.set("client_id", cfg.clientId);
    body.set("client_secret", cfg.clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, { method: "POST", headers, body });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `OAuth2 token request failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("OAuth2 token response was not JSON");
  }
  const accessToken = json.access_token;
  if (typeof accessToken !== "string") {
    throw new Error("OAuth2 token response missing access_token");
  }
  const expiresIn =
    typeof json.expires_in === "number" ? json.expires_in : null;
  return {
    accessToken,
    refreshToken:
      typeof json.refresh_token === "string" ? json.refresh_token : null,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    scope: typeof json.scope === "string" ? json.scope : null,
  };
}

export function exchangeCode(
  cfg: OAuth2ClientConfig,
  opts: { code: string; redirectUri: string },
): Promise<OAuth2TokenSet> {
  return tokenRequest(cfg, {
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
  });
}

export function refreshAccessToken(
  cfg: OAuth2ClientConfig,
  refreshToken: string,
): Promise<OAuth2TokenSet> {
  return tokenRequest(cfg, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

/** Fetch with a Bearer access token. */
export function bearerFetch(
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
}
