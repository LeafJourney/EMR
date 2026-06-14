import { afterEach, describe, expect, it, vi } from "vitest";
import { providerRuntime } from "./registry";

afterEach(() => vi.unstubAllEnvs());

function clearAll() {
  for (const k of [
    "GARMIN_CONSUMER_KEY",
    "GARMIN_CONSUMER_SECRET",
    "GARMIN_ALLOW_MOCK",
    "OURA_CLIENT_ID",
    "OURA_CLIENT_SECRET",
    "WHOOP_CLIENT_ID",
    "WHOOP_CLIENT_SECRET",
    "MOBILE_BIOMETRICS_TOKEN",
  ]) {
    vi.stubEnv(k, "");
  }
  vi.stubEnv("NODE_ENV", "production");
}

describe("providerRuntime", () => {
  it("Oura is live with creds, Coming soon without", () => {
    clearAll();
    expect(providerRuntime("oura").available).toBe(false);
    vi.stubEnv("OURA_CLIENT_ID", "x");
    vi.stubEnv("OURA_CLIENT_SECRET", "y");
    expect(providerRuntime("oura")).toMatchObject({
      available: true,
      mode: "live",
      connectKind: "oauth-redirect",
    });
  });

  it("Whoop is gated on its OAuth2 creds", () => {
    clearAll();
    expect(providerRuntime("whoop").available).toBe(false);
    vi.stubEnv("WHOOP_CLIENT_ID", "x");
    vi.stubEnv("WHOOP_CLIENT_SECRET", "y");
    expect(providerRuntime("whoop").connectKind).toBe("oauth-redirect");
  });

  it("Apple/Android are gated on MOBILE_BIOMETRICS_TOKEN, connectKind mobile-app", () => {
    clearAll();
    expect(providerRuntime("apple-health").available).toBe(false);
    expect(providerRuntime("android").reason).toBe("mobile_only");
    vi.stubEnv("MOBILE_BIOMETRICS_TOKEN", "tok");
    expect(providerRuntime("apple-health")).toMatchObject({
      available: true,
      mode: "mobile",
      connectKind: "mobile-app",
    });
    expect(providerRuntime("android").connectKind).toBe("mobile-app");
  });

  it("Garmin disabled without creds; unimplemented providers are not_implemented", () => {
    clearAll();
    expect(providerRuntime("garmin").available).toBe(false);
    expect(providerRuntime("fitbit").reason).toBe("not_implemented");
    expect(providerRuntime("dexcom").reason).toBe("not_implemented");
  });
});
