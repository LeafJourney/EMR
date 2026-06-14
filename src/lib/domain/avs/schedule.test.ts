import { describe, expect, it } from "vitest";
import { decomposeCarePlan } from "./care-plan-decomposition";
import {
  buildLifestyleRoadmap,
  buildTitrationCalendars,
  parseDelayDays,
  timeOfDayFromTiming,
} from "./schedule";

describe("schedule helpers", () => {
  it("maps timing to a plain time-of-day", () => {
    expect(timeOfDayFromTiming("twice daily")).toBe("Morning and evening");
    expect(timeOfDayFromTiming("at bedtime")).toBe("At bedtime");
    expect(timeOfDayFromTiming(null)).toBe("As your care team directed");
  });

  it("parses titration delays in days/weeks/months and word numbers", () => {
    expect(parseDelayDays("titrate up after two weeks")).toBe(14);
    expect(parseDelayDays("increase in 10 days")).toBe(10);
    expect(parseDelayDays("after 1 month")).toBe(30);
    expect(parseDelayDays("increase the dose")).toBeNull();
  });
});

describe("titration calendar from the metformin fixture", () => {
  const decomposed = decomposeCarePlan(
    [
      "Start metformin 500 mg by mouth twice daily with meals.",
      "Plan to titrate metformin up to 1000 mg twice daily after two weeks if tolerated.",
      "Discontinue glipizide.",
    ].join("\n"),
  );
  const calendars = buildTitrationCalendars(decomposed);

  it("builds one calendar for metformin (discontinue excluded)", () => {
    expect(calendars).toHaveLength(1);
    expect(calendars[0].molecule).toBe("Metformin");
  });

  it("produces a two-step titration: Days 1–14 then Day 15 onward", () => {
    const steps = calendars[0].steps;
    expect(steps).toHaveLength(2);
    expect(steps[0].dayRange).toBe("Days 1–14");
    expect(steps[0].instruction).toContain("500 mg");
    expect(steps[0].timeOfDay).toBe("Morning and evening");
    expect(steps[1].dayRange).toBe("Day 15 onward");
    expect(steps[1].instruction).toContain("1000 mg");
    expect(steps[1].goal).toContain("1000 mg");
  });

  it("never emits a long-paragraph instruction", () => {
    for (const step of calendars[0].steps) {
      expect(step.instruction.length).toBeLessThan(80);
    }
  });
});

describe("single INITIATE produces a one-step calendar", () => {
  it("renders Day 1 onward", () => {
    const decomposed = decomposeCarePlan("Start CBD oil 0.25 mL under the tongue at bedtime.");
    const calendars = buildTitrationCalendars(decomposed);
    expect(calendars).toHaveLength(1);
    expect(calendars[0].steps).toHaveLength(1);
    expect(calendars[0].steps[0].dayRange).toBe("Day 1 onward");
    expect(calendars[0].steps[0].timeOfDay).toBe("At bedtime");
  });
});

describe("lifestyle roadmap", () => {
  const decomposed = decomposeCarePlan(
    [
      "Begin a 14:10 intermittent fasting schedule.",
      "Increase water intake.",
      "Walk for 30 minutes daily.",
      "Aim for 7-8 hours of sleep.",
    ].join("\n"),
  );
  const roadmap = buildLifestyleRoadmap(decomposed);

  it("splits nutrition and behavior with icons + labels", () => {
    expect(roadmap.nutrition.length).toBe(2);
    expect(roadmap.behavior.length).toBe(2);
    const eatingWindow = roadmap.nutrition.find((i) => i.label.includes("14:10"));
    expect(eatingWindow?.icon).toBe("🕒");
    const activity = roadmap.behavior.find((i) => i.label.startsWith("Move your body"));
    expect(activity?.label).toContain("30 minutes");
    const sleep = roadmap.behavior.find((i) => i.icon === "😴");
    expect(sleep?.label).toContain("7-8 hours");
  });
});
