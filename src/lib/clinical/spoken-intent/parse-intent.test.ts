import { describe, expect, it } from "vitest";
import {
  extractWindow,
  parseSpokenIntent,
  parseTemporal,
  splitSegments,
} from "./parse-intent";

const NOW = new Date("2026-06-15T12:00:00.000Z"); // a Monday

describe("segmentation + temporal + window helpers", () => {
  it("keeps 'A and B <temporal>' in one clause", () => {
    const segs = splitSegments("check fasting insulin and NMR lipoprofile next week, and start a 14:10 schedule");
    expect(segs).toHaveLength(2);
    expect(segs[0]).toContain("fasting insulin and NMR lipoprofile next week");
  });

  it("resolves temporal phrases to concrete windows", () => {
    const nextWeek = parseTemporal("draw it next week", NOW);
    expect(nextWeek?.label).toBe("next week");
    expect(nextWeek?.start).toBe(new Date("2026-06-22T12:00:00.000Z").toISOString());
    expect(parseTemporal("in 3 days", NOW)?.label).toBe("in 3 days");
    expect(parseTemporal("in two weeks", NOW)?.start).toBe(new Date("2026-06-29T12:00:00.000Z").toISOString());
    expect(parseTemporal("no time here", NOW)).toBeNull();
  });

  it("extracts an eating window", () => {
    expect(extractWindow("start a 14:10 intermittent fasting schedule")).toBe("14:10");
    expect(extractWindow("16/8 eating window")).toBe("16:8");
  });
});

// ── Headline acceptance fixture: the doc's exact example utterance ──────────
describe("doc example utterance", () => {
  const result = parseSpokenIntent(
    "Let's check your fasting insulin and NMR lipoprofile next week, and start a 14:10 intermittent fasting schedule.",
    { now: NOW },
  );

  it("produces exactly 2 ServiceRequests + 1 CarePlan", () => {
    expect(result.drafts).toHaveLength(3);
    expect(result.lowConfidence).toHaveLength(0);
    const serviceRequests = result.drafts.filter((d) => d.resourceType === "ServiceRequest");
    const carePlans = result.drafts.filter((d) => d.resourceType === "CarePlan");
    expect(serviceRequests).toHaveLength(2);
    expect(carePlans).toHaveLength(1);
  });

  it("codes the labs with the doc's LOINC codes", () => {
    const codes = result.drafts.filter((d) => d.kind === "lab").map((d) => d.code.code).sort();
    expect(codes).toEqual(["2492-2", "43396-1"]); // fasting insulin, NMR lipoprofile
    expect(result.drafts.every((d) => d.kind !== "lab" || d.code.system === "LOINC")).toBe(true);
  });

  it("codes the lifestyle regimen as SNOMED dietary regimen with the window", () => {
    const carePlan = result.drafts.find((d) => d.resourceType === "CarePlan")!;
    expect(carePlan.code.system).toBe("SNOMED");
    expect(carePlan.code.code).toBe("410606002");
    expect(carePlan.detail).toBe("14:10");
  });

  it("applies 'next week' as a concrete occurrencePeriod to both labs", () => {
    for (const lab of result.drafts.filter((d) => d.kind === "lab")) {
      expect(lab.occurrencePeriod?.label).toBe("next week");
      expect(lab.occurrencePeriod?.start).toBe(new Date("2026-06-22T12:00:00.000Z").toISOString());
    }
  });

  it("auto-appends the 12-hour water-fast instruction to fasting labs", () => {
    for (const lab of result.drafts.filter((d) => d.kind === "lab")) {
      expect(lab.fasting?.required).toBe(true);
      expect(lab.fasting?.instruction).toMatch(/12 hours/);
    }
  });

  it("keeps everything intent=draft (nothing transmits unsigned)", () => {
    expect(result.drafts.every((d) => d.intent === "draft")).toBe(true);
  });
});

describe("confidence routing (I_match ≥ 0.88)", () => {
  it("routes a vague single-term mention to the verify queue", () => {
    const result = parseSpokenIntent("let's check her sugar", { now: NOW });
    expect(result.drafts).toHaveLength(0);
    expect(result.lowConfidence.length).toBeGreaterThanOrEqual(1);
    expect(result.lowConfidence[0].confidence).toBeLessThan(0.88);
  });

  it("auto-stages a specific phrase", () => {
    const result = parseSpokenIntent("order an HbA1c", { now: NOW });
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].code.code).toBe("4548-4");
  });

  it("dedupes a target named twice, keeping the higher confidence", () => {
    const result = parseSpokenIntent("check insulin, specifically a fasting insulin", { now: NOW });
    const insulin = result.drafts.filter((d) => d.code.code === "2492-2");
    expect(insulin).toHaveLength(1);
    expect(insulin[0].confidence).toBe(0.93);
  });
});
