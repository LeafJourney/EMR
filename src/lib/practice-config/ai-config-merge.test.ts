import { describe, it, expect } from "vitest";
import { mergeAiConfig } from "./ai-config-merge";

describe("mergeAiConfig", () => {
  it("preserves fleetDefaultEnabled (ship-inert) when saving only defaultModel", () => {
    const existing = {
      fleetDefaultEnabled: false,
      fleet: { scribe: { enabled: true } },
    };
    const merged = mergeAiConfig(existing, {
      defaultModel: { provider: "openrouter", modelId: "x", apiKey: "k" },
    });
    // The regression: this used to come back undefined, re-enabling the fleet.
    expect(merged.fleetDefaultEnabled).toBe(false);
  });

  it("keeps an inert practice inert through a fleet-only edit", () => {
    const merged = mergeAiConfig(
      { fleetDefaultEnabled: false },
      { fleet: { cfo: { enabled: true } } },
    );
    expect(merged.fleetDefaultEnabled).toBe(false);
    expect(merged.fleet.cfo.enabled).toBe(true);
  });

  it("does not overwrite a stored api key with the masked placeholder", () => {
    const merged = mergeAiConfig(
      { defaultModel: { provider: "openrouter", modelId: "x", apiKey: "real-key" } },
      { defaultModel: { provider: "openrouter", modelId: "x", apiKey: "••••••••" } },
    );
    expect(merged.defaultModel.apiKey).toBe("real-key");
  });

  it("merges per-agent fleet overrides over existing ones", () => {
    const merged = mergeAiConfig(
      { fleet: { scribe: { enabled: false }, cfo: { enabled: true } } },
      { fleet: { scribe: { enabled: true } } },
    );
    expect(merged.fleet.scribe.enabled).toBe(true); // edit wins
    expect(merged.fleet.cfo.enabled).toBe(true); // untouched survives
  });
});
