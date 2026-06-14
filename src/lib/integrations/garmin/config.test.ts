import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveGarminMode,
  isGarminConnectable,
  garminConsumerCredentials,
} from "./config";

afterEach(() => vi.unstubAllEnvs());

function setEnv(opts: {
  key?: string;
  secret?: string;
  mock?: string;
  nodeEnv?: string;
}) {
  vi.stubEnv("GARMIN_CONSUMER_KEY", opts.key ?? "");
  vi.stubEnv("GARMIN_CONSUMER_SECRET", opts.secret ?? "");
  vi.stubEnv("GARMIN_ALLOW_MOCK", opts.mock ?? "");
  vi.stubEnv("NODE_ENV", opts.nodeEnv ?? "development");
}

describe("resolveGarminMode (the guardrail)", () => {
  it("is 'disabled' when nothing is configured", () => {
    setEnv({});
    expect(resolveGarminMode()).toBe("disabled");
    expect(isGarminConnectable()).toBe(false);
  });

  it("is 'live' when consumer credentials are present, even in dev", () => {
    setEnv({ key: "ck", secret: "cs" });
    expect(resolveGarminMode()).toBe("live");
    expect(isGarminConnectable()).toBe(true);
  });

  it("is 'mock' only with the explicit opt-in in non-production", () => {
    setEnv({ mock: "true", nodeEnv: "development" });
    expect(resolveGarminMode()).toBe("mock");
  });

  it("can NEVER be 'mock' in production (the load-bearing safety line)", () => {
    setEnv({ mock: "true", nodeEnv: "production" });
    expect(resolveGarminMode()).toBe("disabled");
    expect(isGarminConnectable()).toBe(false);
  });

  it("prefers live credentials over the mock opt-in", () => {
    setEnv({ key: "ck", secret: "cs", mock: "true" });
    expect(resolveGarminMode()).toBe("live");
  });

  it("requires BOTH key and secret to go live", () => {
    setEnv({ key: "ck" });
    expect(garminConsumerCredentials()).toBeNull();
    expect(resolveGarminMode()).toBe("disabled");
  });
});
