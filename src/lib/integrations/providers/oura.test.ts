import { describe, expect, it } from "vitest";
import { mapOura } from "./oura";

describe("mapOura", () => {
  it("maps sleep->sleep and readiness->energy on the 0-10 scale", () => {
    const logs = mapOura("p1", {
      sleep: [{ day: "2026-06-13", score: 85, contributors: { efficiency: 95 } }],
      readiness: [{ day: "2026-06-13", score: 88 }],
    });
    expect(logs).toHaveLength(2);

    const sleep = logs.find((l) => l.metric === "sleep");
    expect(sleep?.value).toBe(8.5);
    expect((sleep?.loggedAt as Date).toISOString()).toBe("2026-06-13T00:00:00.000Z");

    const energy = logs.find((l) => l.metric === "energy");
    expect(energy?.value).toBe(8.8);

    expect(logs.every((l) => l.note?.startsWith("Oura "))).toBe(true);
  });

  it("skips rows missing day or score", () => {
    const logs = mapOura("p1", {
      sleep: [{ score: 85 }],
      readiness: [{ day: "2026-06-13" }],
    });
    expect(logs).toHaveLength(0);
  });
});
