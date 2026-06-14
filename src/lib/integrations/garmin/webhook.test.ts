import { describe, expect, it } from "vitest";
import { parseGarminWebhook } from "./webhook";

const daily = (userId: string, calendarDate: string) => ({
  userId,
  calendarDate,
  averageHeartRateInBeatsPerMinute: 60,
  averageStressLevel: 40,
  maxStressLevel: 80,
  bodyBatteryLowestValue: 10,
  bodyBatteryHighestValue: 90,
});

describe("parseGarminWebhook", () => {
  it("groups push summaries by userId across summary types", () => {
    const { pushes, pings } = parseGarminWebhook({
      dailies: [daily("u1", "2026-06-13"), daily("u2", "2026-06-13")],
      sleeps: [
        { userId: "u1", calendarDate: "2026-06-13", durationInSeconds: 28800, sleepScore: 88 },
      ],
    });
    expect(pings).toHaveLength(0);
    expect(pushes).toHaveLength(2);
    const u1 = pushes.find((p) => p.userId === "u1");
    expect(u1?.payload.dailies).toHaveLength(1);
    expect(u1?.payload.sleeps).toHaveLength(1);
    const u2 = pushes.find((p) => p.userId === "u2");
    expect(u2?.payload.sleeps).toHaveLength(0);
  });

  it("detects ping notifications with callbackURL + summaryType", () => {
    const { pushes, pings } = parseGarminWebhook({
      dailies: [{ userId: "u9", callbackURL: "https://apis.garmin.com/cb/d" }],
      sleeps: [{ userId: "u9", callbackURL: "https://apis.garmin.com/cb/s" }],
    });
    expect(pushes).toHaveLength(0);
    expect(pings).toEqual([
      { userId: "u9", callbackURL: "https://apis.garmin.com/cb/d", summaryType: "dailies" },
      { userId: "u9", callbackURL: "https://apis.garmin.com/cb/s", summaryType: "sleeps" },
    ]);
  });

  it("drops entries without a userId and dedupes pings", () => {
    const { pushes, pings } = parseGarminWebhook({
      dailies: [
        { calendarDate: "2026-06-13" }, // no userId -> dropped
        { userId: "u1", callbackURL: "https://cb" },
        { userId: "u1", callbackURL: "https://cb" }, // duplicate ping
      ],
    });
    expect(pushes).toHaveLength(0);
    expect(pings).toHaveLength(1);
  });

  it("tolerates a non-object / empty body", () => {
    expect(parseGarminWebhook(null)).toEqual({ pushes: [], pings: [] });
    expect(parseGarminWebhook("garbage")).toEqual({ pushes: [], pings: [] });
    expect(parseGarminWebhook({})).toEqual({ pushes: [], pings: [] });
  });
});
