import { describe, it, expect } from "vitest";
import {
  expandSlashCommand,
  listSeedStretchRegions,
  listSeedTopics,
  registerSlashTopic,
} from "./slash-education";

describe("slash-command education library (EMR-703)", () => {
  it("expands all four seed topics from the Maya Reyes fixture", () => {
    for (const topic of ["blood pressure", "blood glucose", "shoulder pain", "cholesterol"]) {
      const r = expandSlashCommand(`/${topic}`);
      expect(r.ok, `missing /${topic}`).toBe(true);
      if (r.ok) expect(r.body.length).toBeGreaterThan(50);
    }
  });

  it("blood pressure body matches the verbatim seed text", () => {
    const r = expandSlashCommand("/blood pressure");
    if (!r.ok) throw new Error("expected hit");
    expect(r.body).toContain("'trends are your friends.'");
  });

  it("cholesterol body matches the verbatim seed text", () => {
    const r = expandSlashCommand("/cholesterol");
    if (!r.ok) throw new Error("expected hit");
    expect(r.body).toContain("Cardio Platinum, Kyoloic");
    expect(r.body).toContain("www.examine.com");
  });

  it("shoulder stretch exercises returns a numbered list of stretches", () => {
    const r = expandSlashCommand("/shoulder stretch exercises");
    if (!r.ok) throw new Error("expected hit");
    expect(r.body).toMatch(/^1\. /m);
    expect(r.body).toMatch(/^5\. /m);
  });

  it("returns unknown-topic for unknown slash commands", () => {
    const r = expandSlashCommand("/never-heard-of-it");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown-topic");
  });

  it("returns unknown-region for stretch commands with no matching region", () => {
    const r = expandSlashCommand("/elbow stretch exercises");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown-region");
  });

  it("malformed input flagged as malformed", () => {
    expect(expandSlashCommand("blood pressure").ok).toBe(false);
    expect(expandSlashCommand("/").ok).toBe(false);
  });

  it("supports runtime registration so practices can add snippets without code", () => {
    registerSlashTopic({ topic: "test rule", body: "TEST BODY" });
    const r = expandSlashCommand("/test rule");
    if (!r.ok) throw new Error("expected hit");
    expect(r.body).toBe("TEST BODY");
  });

  it("exposes seeded topics and stretch regions for editor autocomplete", () => {
    expect(listSeedTopics().map((t) => t.topic)).toContain("blood pressure");
    expect(listSeedStretchRegions()).toContain("shoulder");
  });
});
