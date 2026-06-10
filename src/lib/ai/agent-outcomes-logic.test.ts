import { describe, expect, it } from "vitest";
import {
  type OutcomeRow,
  summarizeAgentOutcomes,
} from "./agent-outcomes-logic";

const row = (p: Partial<OutcomeRow>): OutcomeRow => ({
  agentName: "scribe",
  decision: "accepted",
  estimatedMinutesSaved: 8,
  ...p,
});

describe("summarizeAgentOutcomes", () => {
  it("returns empty totals with no rows", () => {
    const s = summarizeAgentOutcomes([]);
    expect(s.totals.decisions).toBe(0);
    expect(s.totals.minutesSaved).toBe(0);
    expect(s.totals.acceptanceRate).toBeNull();
    expect(s.byAgent).toEqual([]);
  });

  it("counts decision types and sums minutes saved", () => {
    const s = summarizeAgentOutcomes([
      row({ decision: "accepted", estimatedMinutesSaved: 8 }),
      row({ decision: "accepted_with_edits", estimatedMinutesSaved: 5 }),
      row({ decision: "rejected", estimatedMinutesSaved: null }),
      row({ decision: "dismissed", estimatedMinutesSaved: null }),
      row({ decision: "auto_applied", estimatedMinutesSaved: 2 }),
    ]);
    expect(s.totals.decisions).toBe(5);
    expect(s.totals.accepted).toBe(2);
    expect(s.totals.rejected).toBe(1);
    expect(s.totals.dismissed).toBe(1);
    expect(s.totals.autoApplied).toBe(1);
    expect(s.totals.minutesSaved).toBe(15);
  });

  it("computes acceptanceRate as accepted / (accepted + rejected)", () => {
    const s = summarizeAgentOutcomes([
      row({ decision: "accepted" }),
      row({ decision: "accepted_with_edits" }),
      row({ decision: "rejected", estimatedMinutesSaved: null }),
      // dismissed + auto_applied excluded from the rate denominator
      row({ decision: "dismissed", estimatedMinutesSaved: null }),
      row({ decision: "auto_applied", estimatedMinutesSaved: 2 }),
    ]);
    expect(s.totals.acceptanceRate).toBeCloseTo(2 / 3, 10);
  });

  it("leaves acceptanceRate null when nothing was humanly reviewed", () => {
    const s = summarizeAgentOutcomes([
      row({ decision: "auto_applied", estimatedMinutesSaved: 2 }),
      row({ decision: "dismissed", estimatedMinutesSaved: null }),
    ]);
    expect(s.totals.acceptanceRate).toBeNull();
  });

  it("groups by agent and sorts by minutes saved desc", () => {
    const s = summarizeAgentOutcomes([
      row({ agentName: "scribe", decision: "accepted", estimatedMinutesSaved: 8 }),
      row({ agentName: "scribe", decision: "accepted", estimatedMinutesSaved: 8 }),
      row({ agentName: "denial-triage", decision: "accepted", estimatedMinutesSaved: 5 }),
    ]);
    expect(s.byAgent.map((g) => g.agentName)).toEqual(["scribe", "denial-triage"]);
    expect(s.byAgent[0].minutesSaved).toBe(16);
    expect(s.byAgent[0].acceptanceRate).toBe(1);
    expect(s.byAgent[1].minutesSaved).toBe(5);
  });
});
