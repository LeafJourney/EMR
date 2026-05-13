import { describe, expect, it } from "vitest";

import { evaluatePatientCDS } from "./engine";

describe("evaluatePatientCDS", () => {
  it("should return a CDSTrigger when overtraining rule is met", () => {
    const recentLogs = [] as any;
    const recentObservations = [
      {
        patientId: "p1",
        category: "lifestyle_shift",
        summary: "Whoop Strain logged at 18/21.",
        metadata: { strain: 18 },
        createdAt: new Date(),
        id: "obs1",
        observedBy: "system:whoop",
        observedByKind: "agent",
        severity: "notable",
        evidence: {},
      },
    ] as any;

    const triggers = evaluatePatientCDS("p1", recentLogs, recentObservations);

    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers[0].ruleName).toBe("OvertrainingRisk");
    expect(triggers[0].severity).toBe("notable");
  });

  it("should return empty array when no rules are met", () => {
    const recentLogs = [] as any;
    const recentObservations = [
      {
        patientId: "p1",
        category: "lifestyle_shift",
        summary: "Whoop Strain logged at 10/21.",
        metadata: { strain: 10 },
        createdAt: new Date(),
        id: "obs1",
        observedBy: "system:whoop",
        observedByKind: "agent",
        severity: "info",
        evidence: {},
      },
    ] as any;

    const triggers = evaluatePatientCDS("p1", recentLogs, recentObservations);
    expect(triggers.length).toBe(0);
  });
});
