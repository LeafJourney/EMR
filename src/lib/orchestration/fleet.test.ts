import { describe, it, expect } from "vitest";
import {
  FLEET_INERT_CUTOFF,
  defaultFleetEnabledForPractice,
  resolveFleetEnabled,
} from "./fleet";

describe("resolveFleetEnabled", () => {
  it("grandfathers practices with no fleetDefaultEnabled (absent ⇒ enabled)", () => {
    expect(resolveFleetEnabled({}, "scribe").enabled).toBe(true);
    expect(resolveFleetEnabled(null, "scribe").enabled).toBe(true);
    expect(resolveFleetEnabled(undefined, "scribe").enabled).toBe(true);
  });

  it("is inert when fleetDefaultEnabled is false and there is no override", () => {
    expect(resolveFleetEnabled({ fleetDefaultEnabled: false }, "scribe").enabled).toBe(false);
  });

  it("lets an explicit per-agent enable override the inert default", () => {
    const cfg = { fleetDefaultEnabled: false, fleet: { scribe: { enabled: true } } };
    expect(resolveFleetEnabled(cfg, "scribe").enabled).toBe(true);
    // a different agent with no override stays inert
    expect(resolveFleetEnabled(cfg, "cfo").enabled).toBe(false);
  });

  it("lets an explicit per-agent disable override an enabled default", () => {
    const cfg = { fleetDefaultEnabled: true, fleet: { scribe: { enabled: false } } };
    expect(resolveFleetEnabled(cfg, "scribe").enabled).toBe(false);
  });

  it("passes through a per-agent modelId override", () => {
    const cfg = { fleet: { scribe: { enabled: true, modelId: "anthropic/x" } } };
    expect(resolveFleetEnabled(cfg, "scribe")).toEqual({ enabled: true, modelId: "anthropic/x" });
  });
});

describe("defaultFleetEnabledForPractice", () => {
  it("grandfathers practices created before the cutoff (enabled)", () => {
    const before = new Date(FLEET_INERT_CUTOFF.getTime() - 86_400_000);
    expect(defaultFleetEnabledForPractice(before)).toBe(true);
  });

  it("ships new practices inert (disabled) after the cutoff", () => {
    const after = new Date(FLEET_INERT_CUTOFF.getTime() + 86_400_000);
    expect(defaultFleetEnabledForPractice(after)).toBe(false);
  });
});
