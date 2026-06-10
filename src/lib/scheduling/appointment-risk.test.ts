import { describe, it, expect } from "vitest";
import { computeAppointmentRisk } from "./appointment-risk";

// Fixed reference points; tests assert relative behavior (not absolute
// probabilities) so they stay robust to the model's use of Date.now().
const start = new Date("2026-07-01T15:00:00Z");
const booked = new Date("2026-06-20T15:00:00Z");

function pastVisits(statuses: string[]): { status: string; startAt: Date }[] {
  return statuses.map((status, i) => ({
    status,
    startAt: new Date(start.getTime() - (i + 1) * 30 * 86_400_000),
  }));
}

describe("computeAppointmentRisk (EMR-207)", () => {
  it("returns a valid prediction shape", () => {
    const r = computeAppointmentRisk({
      startAt: start,
      bookedAt: booked,
      modality: "video",
      priorVisits: [],
    });
    expect(r.probability).toBeGreaterThanOrEqual(0);
    expect(r.probability).toBeLessThanOrEqual(1);
    expect(["low", "medium", "high"]).toContain(r.tier);
    expect(Array.isArray(r.topFactors)).toBe(true);
  });

  it("scores a chronic no-show patient higher than a reliable one", () => {
    const reliable = computeAppointmentRisk({
      startAt: start,
      bookedAt: booked,
      modality: "video",
      priorVisits: pastVisits(["completed", "completed", "completed", "completed"]),
    });
    const flaky = computeAppointmentRisk({
      startAt: start,
      bookedAt: booked,
      modality: "video",
      priorVisits: pastVisits(["no_show", "no_show", "cancelled", "completed"]),
    });
    expect(flaky.probability).toBeGreaterThan(reliable.probability);
  });

  it("ignores visits that fall after the appointment (no future leakage)", () => {
    const futureNoShow = {
      status: "no_show",
      startAt: new Date(start.getTime() + 60 * 86_400_000),
    };
    const withFuture = computeAppointmentRisk({
      startAt: start,
      bookedAt: booked,
      modality: "video",
      priorVisits: [futureNoShow],
    });
    const withoutPriors = computeAppointmentRisk({
      startAt: start,
      bookedAt: booked,
      modality: "video",
      priorVisits: [],
    });
    expect(withFuture.probability).toBeCloseTo(withoutPriors.probability, 10);
  });
});
