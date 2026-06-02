import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVIDER_PREFS,
  burnoutIndex,
  evaluateBooking,
  type BookingProposal,
  type DayLoad,
  type ProviderPrefs,
} from "./provider-prefs";

const prefs = (overrides: Partial<ProviderPrefs> = {}): ProviderPrefs => ({
  providerId: "prov-a",
  ...DEFAULT_PROVIDER_PREFS,
  ...overrides,
});

// A weekday inside the default workDays/workHours.
const WED = new Date(2026, 4, 20, 0, 0, 0, 0); // 2026-05-20
const at = (h: number, m = 0, dayOffset = 0) =>
  new Date(WED.getFullYear(), WED.getMonth(), WED.getDate() + dayOffset, h, m, 0, 0);

const proposal = (overrides: Partial<BookingProposal> = {}): BookingProposal => ({
  startAt: at(10),
  endAt: at(10, 30),
  isHighIntensity: false,
  isSameDayAddon: false,
  ...overrides,
});

const emptyDay: DayLoad = {
  day: WED,
  scheduledVisits: 0,
  highIntensityVisits: 0,
  avgDurationMin: 30,
  latestStartHour: 9,
  totalDocumentedHours: 0,
};

describe("evaluateBooking", () => {
  it("allows a clean mid-morning booking on a work day", () => {
    const d = evaluateBooking(prefs(), proposal(), emptyDay, 10, 0);
    expect(d.allowed).toBe(true);
    expect(d.hardViolations).toEqual([]);
    expect(d.softViolations).toEqual([]);
  });

  it("hard-blocks daily and weekly cap breaches", () => {
    const daily = evaluateBooking(
      prefs({ maxPatientsPerDay: 16 }),
      proposal(),
      { ...emptyDay, scheduledVisits: 16 },
      10,
      0,
    );
    expect(daily.allowed).toBe(false);
    expect(daily.hardViolations).toContain("exceeds_daily_cap");

    const weekly = evaluateBooking(prefs({ maxPatientsPerWeek: 60 }), proposal(), emptyDay, 60, 0);
    expect(weekly.hardViolations).toContain("exceeds_weekly_cap");
  });

  it("hard-blocks off-day, off-hours, and rejected same-day add-ons", () => {
    const sunday = evaluateBooking(
      prefs(),
      proposal({ startAt: at(10, 0, -3), endAt: at(10, 30, -3) }), // shift to a non-work day if needed
      emptyDay,
      10,
      0,
    );
    // 2026-05-17 is a Sunday (WED is 2026-05-20); confirm via getDay guard.
    if (!DEFAULT_PROVIDER_PREFS.workDays.includes(at(10, 0, -3).getDay())) {
      expect(sunday.hardViolations).toContain("outside_work_day");
    }

    const offHours = evaluateBooking(prefs(), proposal({ startAt: at(6), endAt: at(6, 30) }), emptyDay, 10, 0);
    expect(offHours.hardViolations).toContain("outside_work_hours");

    const addon = evaluateBooking(
      prefs({ acceptsSameDayAddons: false }),
      proposal({ isSameDayAddon: true }),
      emptyDay,
      10,
      0,
    );
    expect(addon.hardViolations).toContain("rejects_same_day_addons");
  });

  it("flags soft violations (high-intensity cap, lunch, buffer) without blocking", () => {
    const intensity = evaluateBooking(
      prefs({ maxHighIntensityPerDay: 2 }),
      proposal({ isHighIntensity: true }),
      { ...emptyDay, highIntensityVisits: 2 },
      10,
      0,
    );
    expect(intensity.allowed).toBe(true);
    expect(intensity.softViolations).toContain("exceeds_high_intensity_cap");

    const lunch = evaluateBooking(
      prefs({ lunchMinutes: 30 }),
      proposal({ startAt: at(11), endAt: at(14) }),
      emptyDay,
      10,
      0,
    );
    expect(lunch.softViolations).toContain("violates_lunch");

    const buffer = evaluateBooking(prefs({ minBufferMinutes: 5 }), proposal(), emptyDay, 10, 3);
    expect(buffer.softViolations).toContain("no_buffer");
  });
});

describe("burnoutIndex", () => {
  const lightDay: DayLoad = {
    day: WED,
    scheduledVisits: 4,
    highIntensityVisits: 0,
    avgDurationMin: 30,
    latestStartHour: 15,
    totalDocumentedHours: 5,
  };
  const heavyDay: DayLoad = {
    day: WED,
    scheduledVisits: 16,
    highIntensityVisits: 4,
    avgDurationMin: 45,
    latestStartHour: 21,
    totalDocumentedHours: 14,
  };

  it("rates a light fortnight green", () => {
    const r = burnoutIndex(prefs({ selfReportedBurnout: 1 }), Array(14).fill(lightDay));
    expect(r.level).toBe("green");
    expect(r.score).toBeLessThan(0.45);
  });

  it("rates a saturated, late-running fortnight red", () => {
    const r = burnoutIndex(prefs({ selfReportedBurnout: 9 }), Array(14).fill(heavyDay));
    expect(r.level).toBe("red");
    expect(r.score).toBeGreaterThanOrEqual(0.7);
    expect(r.components.saturation).toBeGreaterThan(0.8);
  });

  it("defaults self-report to the midpoint when unknown", () => {
    const r = burnoutIndex(prefs({ selfReportedBurnout: null }), Array(14).fill(lightDay));
    expect(r.components.selfReport).toBe(0.5);
  });
});
