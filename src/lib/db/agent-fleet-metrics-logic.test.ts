import { describe, expect, it } from "vitest";
import {
  type FleetJobRow,
  summarizeFleetMetrics,
} from "./agent-fleet-metrics-logic";

const NOW = new Date("2026-06-06T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const job = (p: Partial<FleetJobRow>): FleetJobRow => ({
  agentName: "intake",
  status: "succeeded",
  createdAt: hoursAgo(1),
  completedAt: hoursAgo(1),
  ...p,
});

describe("summarizeFleetMetrics (EMR-940 / EMR-969)", () => {
  it("returns zero-filled tiles for an empty fleet", () => {
    const m = summarizeFleetMetrics([], NOW);
    expect(m.totals.total).toBe(0);
    expect(m.totals.active).toBe(0);
    expect(m.totals.byStatus).toEqual({
      pending: 0,
      claimed: 0,
      running: 0,
      needs_approval: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
    });
    expect(m.agents).toEqual([]);
    expect(m.generatedAt).toBe(NOW.toISOString());
  });

  it("tallies EMR-940 status tiles across the fleet", () => {
    const m = summarizeFleetMetrics(
      [
        job({ status: "pending", completedAt: null }),
        job({ status: "running", completedAt: null }),
        job({ status: "claimed", completedAt: null }),
        job({ status: "needs_approval", completedAt: null }),
        job({ status: "succeeded" }),
        job({ status: "failed" }),
      ],
      NOW,
    );
    expect(m.totals.total).toBe(6);
    expect(m.totals.byStatus.pending).toBe(1);
    expect(m.totals.byStatus.running).toBe(1);
    // active = pending + claimed + running + needs_approval
    expect(m.totals.active).toBe(4);
    expect(m.totals.needsApproval).toBe(1);
  });

  it("counts jobs handled in the 24h and 7d windows by completedAt", () => {
    const m = summarizeFleetMetrics(
      [
        job({ status: "succeeded", completedAt: hoursAgo(2) }), // in 24h + 7d
        job({ status: "failed", completedAt: hoursAgo(48) }), // in 7d only
        job({ status: "cancelled", completedAt: hoursAgo(24 * 8) }), // outside both
        job({ status: "running", completedAt: null }), // never "handled"
      ],
      NOW,
    );
    expect(m.totals.handled24h).toBe(1);
    expect(m.totals.handled7d).toBe(2);
  });

  it("builds per-agent summaries sorted busiest-first (EMR-969)", () => {
    const m = summarizeFleetMetrics(
      [
        job({ agentName: "scribe", status: "running", completedAt: null }),
        job({ agentName: "scribe", status: "claimed", completedAt: null }),
        job({ agentName: "scribe", status: "succeeded", completedAt: hoursAgo(3) }),
        job({ agentName: "billing", status: "running", completedAt: null }),
        job({ agentName: "billing", status: "succeeded", completedAt: hoursAgo(3) }),
      ],
      NOW,
    );
    expect(m.agents.map((a) => a.agentName)).toEqual(["scribe", "billing"]);
    const scribe = m.agents[0];
    expect(scribe.total).toBe(3);
    expect(scribe.running).toBe(2); // running + claimed
    expect(scribe.handled24h).toBe(1);
    expect(scribe.byStatus.succeeded).toBe(1);
  });

  it("counts an unknown status toward total but not any tile", () => {
    const m = summarizeFleetMetrics(
      [job({ status: "quantum_superposition" as never, completedAt: null })],
      NOW,
    );
    expect(m.totals.total).toBe(1);
    expect(m.totals.active).toBe(0);
    expect(m.agents[0].total).toBe(1);
  });
});
