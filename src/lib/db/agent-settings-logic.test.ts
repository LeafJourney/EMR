import { describe, expect, it } from "vitest";
import { resolveAgentEnabled } from "./agent-settings-logic";

describe("resolveAgentEnabled (EMR-974)", () => {
  it("defaults to enabled when no row exists (fail-open)", () => {
    expect(resolveAgentEnabled(null)).toBe(true);
    expect(resolveAgentEnabled(undefined)).toBe(true);
  });

  it("honors an explicit disable", () => {
    expect(resolveAgentEnabled({ enabled: false })).toBe(false);
  });

  it("honors an explicit enable", () => {
    expect(resolveAgentEnabled({ enabled: true })).toBe(true);
  });
});
