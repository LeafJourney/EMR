import { describe, expect, it } from "vitest";
import { mapGarminPayload, GARMIN_NOTE_PREFIX } from "./garmin-vitals";

const payload = {
  dailies: [
    {
      calendarDate: "2026-06-13",
      averageHeartRateInBeatsPerMinute: 65,
      averageStressLevel: 42,
      maxStressLevel: 88,
      bodyBatteryLowestValue: 12,
      bodyBatteryHighestValue: 95,
    },
  ],
  sleeps: [{ calendarDate: "2026-06-13", durationInSeconds: 28800, sleepScore: 85 }],
};

describe("mapGarminPayload", () => {
  it("maps body battery, stress, and sleep to normalized OutcomeLogs", () => {
    const logs = mapGarminPayload("p1", payload, false);
    expect(logs).toHaveLength(3);

    const energy = logs.find((l) => l.metric === "energy");
    expect(energy?.value).toBe(9.5);
    expect(energy?.note?.startsWith(GARMIN_NOTE_PREFIX)).toBe(true);

    const anxiety = logs.find((l) => l.metric === "anxiety");
    expect(anxiety?.value).toBeCloseTo(4.2);

    const sleep = logs.find((l) => l.metric === "sleep");
    expect(sleep?.value).toBe(8.5);

    // loggedAt must be the UTC midnight of calendarDate — that stability is
    // what makes the (metric, loggedAt) idempotency key reliable across pushes.
    expect((energy?.loggedAt as Date).toISOString()).toBe(
      "2026-06-13T00:00:00.000Z",
    );
  });

  it("tags simulated data so it can never pass for — or export as — real", () => {
    const logs = mapGarminPayload("p1", payload, true);
    expect(logs.every((l) => l.note?.includes("(SIMULATED)"))).toBe(true);
    // Still matches the idempotent-clear prefix, so simulated rows are cleaned
    // up on a later real sync.
    expect(logs.every((l) => l.note?.startsWith(GARMIN_NOTE_PREFIX))).toBe(true);
  });
});
