import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  exchangeCode,
  refreshAccessToken,
  type OAuth2ClientConfig,
} from "./oauth2";

global.fetch = vi.fn();

const cfg: OAuth2ClientConfig = {
  authorizeUrl: "https://p.example/auth",
  tokenUrl: "https://p.example/token",
  clientId: "cid",
  clientSecret: "csec",
  scopes: ["a", "b"],
  tokenAuth: "body",
};

beforeEach(() => vi.mocked(fetch).mockReset());

function jsonRes(obj: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(obj) } as unknown as Response;
}

describe("buildAuthorizeUrl", () => {
  it("includes response_type, client_id, redirect, scope, state", () => {
    const u = new URL(buildAuthorizeUrl(cfg, { redirectUri: "https://app/cb", state: "xyz" }));
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app/cb");
    expect(u.searchParams.get("scope")).toBe("a b");
    expect(u.searchParams.get("state")).toBe("xyz");
  });
});

describe("exchangeCode", () => {
  it("posts grant_type=authorization_code + client creds in body, parses tokens", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonRes({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "a b" }),
    );
    const tok = await exchangeCode(cfg, { code: "c", redirectUri: "https://app/cb" });
    expect(tok.accessToken).toBe("at");
    expect(tok.refreshToken).toBe("rt");
    expect(tok.expiresAt).toBeInstanceOf(Date);
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(String(init.body)).toContain("grant_type=authorization_code");
    expect(String(init.body)).toContain("client_id=cid");
  });

  it("uses HTTP Basic auth when tokenAuth=basic", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonRes({ access_token: "at" }));
    await exchangeCode({ ...cfg, tokenAuth: "basic" }, { code: "c", redirectUri: "x" });
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    expect(String(init.body)).not.toContain("client_secret");
  });

  it("throws on a non-ok token response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, text: async () => "bad" } as unknown as Response);
    await expect(exchangeCode(cfg, { code: "c", redirectUri: "x" })).rejects.toThrow();
  });
});

describe("refreshAccessToken", () => {
  it("posts grant_type=refresh_token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonRes({ access_token: "at2", refresh_token: "rt2" }));
    const tok = await refreshAccessToken(cfg, "rt");
    expect(tok.accessToken).toBe("at2");
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(String(init.body)).toContain("grant_type=refresh_token");
  });
});
