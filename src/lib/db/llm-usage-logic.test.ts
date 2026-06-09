import { describe, expect, it } from "vitest";
import {
  type LlmUsageRow,
  summarizeLlmUsage,
} from "./llm-usage-logic";

const row = (p: Partial<LlmUsageRow>): LlmUsageRow => ({
  agentBucket: "charting",
  agentName: "charting.note-summarize",
  model: "deepseek/deepseek-chat",
  tokensIn: 100,
  tokensOut: 50,
  costMicroCents: null,
  ok: true,
  ...p,
});

describe("summarizeLlmUsage (EMR-724)", () => {
  it("returns empty totals with no rows", () => {
    const s = summarizeLlmUsage([]);
    expect(s.totals).toEqual({
      calls: 0,
      ok: 0,
      failed: 0,
      tokensIn: 0,
      tokensOut: 0,
      tokensTotal: 0,
      costMicroCents: 0,
    });
    expect(s.byBucket).toEqual([]);
    expect(s.byModel).toEqual([]);
  });

  it("sums tokens, costs, and ok/failed call counts", () => {
    const s = summarizeLlmUsage([
      row({ tokensIn: 100, tokensOut: 50, costMicroCents: 200 }),
      row({ tokensIn: 10, tokensOut: 5, ok: false, costMicroCents: null }),
      row({ tokensIn: 40, tokensOut: 20, costMicroCents: 80 }),
    ]);
    expect(s.totals.calls).toBe(3);
    expect(s.totals.ok).toBe(2);
    expect(s.totals.failed).toBe(1);
    expect(s.totals.tokensIn).toBe(150);
    expect(s.totals.tokensOut).toBe(75);
    expect(s.totals.tokensTotal).toBe(225);
    // null cost contributes 0
    expect(s.totals.costMicroCents).toBe(280);
  });

  it("groups by bucket and by model, sorted by total tokens desc", () => {
    const s = summarizeLlmUsage([
      row({ agentBucket: "charting", model: "a", tokensIn: 10, tokensOut: 0 }),
      row({ agentBucket: "billing", model: "b", tokensIn: 100, tokensOut: 0 }),
      row({ agentBucket: "billing", model: "b", tokensIn: 50, tokensOut: 0 }),
    ]);
    expect(s.byBucket.map((g) => g.key)).toEqual(["billing", "charting"]);
    expect(s.byBucket[0].calls).toBe(2);
    expect(s.byBucket[0].tokensTotal).toBe(150);
    expect(s.byModel.map((g) => g.key)).toEqual(["b", "a"]);
  });
});
