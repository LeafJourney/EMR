import { describe, it, expect } from "vitest";
import {
  describeTrend,
  cindyTrend,
  cindyListSummary,
  cindyImageRead,
  CINDY_PREFIX,
} from "./cindy-says";

describe("describeTrend", () => {
  it("returns null for <2 points", () => {
    expect(describeTrend([5])).toBeNull();
  });
  it("describes an upward trend", () => {
    const t = describeTrend([5, 8, 12], "mg");
    expect(t).toMatch(/up/);
    expect(t).toMatch(/12/);
  });
  it("describes steadiness", () => {
    expect(describeTrend([100, 100, 100])).toMatch(/steady/i);
  });
});

describe("cindyTrend", () => {
  it("produces a says-voiced analysis with bullets", () => {
    const a = cindyTrend({ label: "A1C", values: [7.2, 6.8, 6.4], unit: "%", interpretation: "improving" });
    expect(a.prefix).toBe(CINDY_PREFIX.says);
    expect(a.bullets.length).toBeGreaterThan(0);
    expect(a.bullets[0]).toMatch(/A1C/);
  });
});

describe("cindyListSummary", () => {
  it("summarizes an empty list honestly", () => {
    const a = cindyListSummary([], { noun: "messages" });
    expect(a.bullets[0]).toMatch(/No messages/);
  });
  it("leads with the newest item and a count", () => {
    const a = cindyListSummary(
      [
        { title: "Refill request", meta: "2d ago" },
        { title: "Lab question" },
      ],
      { noun: "messages" },
    );
    expect(a.bullets[0]).toMatch(/2 messages/);
    expect(a.bullets[0]).toMatch(/Refill request/);
  });
});

describe("cindyImageRead (EMR-899/902)", () => {
  it("flags worrisome keywords in the report", () => {
    const a = cindyImageRead("MRI Brain", "Findings: a 6mm enhancing mass in the left frontal lobe.");
    expect(a.prefix).toBe(CINDY_PREFIX.sees);
    expect(a.bullets.join(" ")).toMatch(/mass/);
  });
  it("notes a normal study", () => {
    const a = cindyImageRead("CT Chest", "No acute cardiopulmonary process. Unremarkable study.");
    expect(a.bullets.join(" ")).toMatch(/normal|unremarkable/i);
  });
});
