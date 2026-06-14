import { describe, expect, it } from "vitest";
import { mapWhoop } from "./whoop";

describe("mapWhoop", () => {
  it("joins recovery to its cycle for the day + strain observation, maps sleep", () => {
    const { logs, observations } = mapWhoop("p1", {
      cycles: [
        { id: 100, start: "2026-06-13T06:00:00Z", score: { strain: 17.2, max_heart_rate: 170 } },
      ],
      recovery: [{ cycle_id: 100, score: { recovery_score: 82, hrv_rmssd_milli: 68 } }],
      sleep: [{ start: "2026-06-13T05:00:00Z", score: { sleep_performance_percentage: 95 } }],
    });

    const energy = logs.find((l) => l.metric === "energy");
    expect(energy?.value).toBe(8.2);
    expect((energy?.loggedAt as Date).toISOString()).toBe("2026-06-13T00:00:00.000Z");

    const sleep = logs.find((l) => l.metric === "sleep");
    expect(sleep?.value).toBe(9.5);

    expect(observations).toHaveLength(1);
    expect(observations?.[0].severity).toBe("notable"); // strain > 16
    expect((observations?.[0].metadata as { strain: number }).strain).toBe(17.2);
    expect(logs.every((l) => l.note?.startsWith("Whoop "))).toBe(true);
  });

  it("drops recovery whose cycle is unknown", () => {
    const { logs } = mapWhoop("p1", {
      cycles: [],
      recovery: [{ cycle_id: 999, score: { recovery_score: 80 } }],
      sleep: [],
    });
    expect(logs).toHaveLength(0);
  });
});
