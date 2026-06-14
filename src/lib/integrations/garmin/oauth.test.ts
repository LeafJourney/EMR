import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchRequestToken,
  buildAuthorizeUrl,
  exchangeAccessToken,
  signedFetch,
} from "./oauth";

global.fetch = vi.fn();

beforeEach(() => {
  vi.stubEnv("GARMIN_CONSUMER_KEY", "consumer-key");
  vi.stubEnv("GARMIN_CONSUMER_SECRET", "consumer-secret");
  vi.mocked(fetch).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("Garmin OAuth 1.0a", () => {
  it("signs the request_token call with a callback and parses the token pair", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "oauth_token=rt&oauth_token_secret=rts",
    } as unknown as Response);

    const pair = await fetchRequestToken("https://app.example/cb");
    expect(pair).toEqual({ token: "rt", tokenSecret: "rts" });

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth).toContain("OAuth ");
    expect(auth).toContain("oauth_consumer_key");
    expect(auth).toContain("oauth_signature");
    expect(auth).toContain("oauth_callback");
  });

  it("builds an authorize URL carrying the request token", () => {
    const url = buildAuthorizeUrl("rt", "https://app.example/cb");
    expect(url).toContain("oauth_token=rt");
  });

  it("exchanges the verifier for a long-lived access token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "oauth_token=at&oauth_token_secret=ats",
    } as unknown as Response);

    const pair = await exchangeAccessToken({
      requestToken: "rt",
      requestTokenSecret: "rts",
      verifier: "v123",
    });
    expect(pair).toEqual({ token: "at", tokenSecret: "ats" });

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth).toContain("oauth_verifier");
  });

  it("folds query params into the signed request URL", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    } as unknown as Response);

    await signedFetch(
      "GET",
      "https://apis.garmin.com/wellness-api/rest/dailies",
      { token: "at", tokenSecret: "ats" },
      { uploadStartTimeInSeconds: "1", uploadEndTimeInSeconds: "2" },
    );

    const calledUrl = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(calledUrl).toContain("uploadStartTimeInSeconds=1");
    expect(calledUrl).toContain("uploadEndTimeInSeconds=2");
  });

  it("throws on a malformed token response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "not-a-token-response",
    } as unknown as Response);
    await expect(fetchRequestToken("https://app.example/cb")).rejects.toThrow();
  });
});
