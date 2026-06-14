import { describe, expect, it } from "vitest";
import {
  extractHealthKit,
  extractHealthConnect,
  mapMobile,
  providerForMobileSource,
} from "./normalize";

describe("mobile biometrics normalize", () => {
  it("extracts + maps Apple HealthKit sleep / steps / HRV", () => {
    const input = extractHealthKit({
      categorySamples: [
        {
          type: "HKCategoryTypeIdentifierSleepAnalysis",
          value: 1,
          startDate: "2026-06-13T23:00:00Z",
          endDate: "2026-06-14T07:00:00Z",
        },
      ],
      quantitySamples: [
        {
          type: "HKQuantityTypeIdentifierStepCount",
          value: 8000,
          startDate: "2026-06-13T12:00:00Z",
          endDate: "2026-06-13T12:01:00Z",
        },
        {
          type: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
          value: 55,
          startDate: "x",
          endDate: "2026-06-13T08:00:00Z",
        },
      ],
    });
    const { logs, observations } = mapMobile("p1", "apple-health", input);
    expect(logs.find((l) => l.metric === "sleep")?.value).toBe(10); // 8h capped
    expect(logs.find((l) => l.metric === "energy")?.value).toBe(8); // 8000/10000*10
    expect(observations).toHaveLength(1);
    expect(logs.every((l) => l.note?.startsWith("Apple Health "))).toBe(true);
  });

  it("extracts Android Health Connect records", () => {
    const input = extractHealthConnect({
      records: [
        { recordType: "SleepSession", startTime: "2026-06-13T23:00:00Z", endTime: "2026-06-14T05:00:00Z" },
        { recordType: "Steps", startTime: "2026-06-13T10:00:00Z", value: 5000 },
      ],
    });
    const { logs } = mapMobile("p1", "android", input);
    expect(logs.find((l) => l.metric === "sleep")?.value).toBe(7.5); // 6h/8*10
    expect(logs.every((l) => l.note?.startsWith("Android Health "))).toBe(true);
  });

  it("maps an inbound source to its provider slug", () => {
    expect(providerForMobileSource("apple-health")).toBe("apple-health");
    expect(providerForMobileSource("health-connect")).toBe("android");
    expect(providerForMobileSource("nope")).toBeNull();
  });
});
