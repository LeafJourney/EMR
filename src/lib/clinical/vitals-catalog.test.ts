import { describe, expect, it } from "vitest";
import {
  VITALS,
  VITAL_SOURCES,
  vitalByKey,
  isVitalAbnormal,
} from "./vitals-catalog";

// EMR-872 — vitals catalog with multi-source capture

describe("VITAL_SOURCES", () => {
  it("lists the in-office and wearable / RPM sources Dr. Patel named", () => {
    expect(VITAL_SOURCES).toEqual([
      "In office",
      "Garmin",
      "iWatch",
      "Whoop",
      "CGM",
      "RPM",
    ]);
  });
});

describe("VITALS catalog", () => {
  it("is non-empty and includes the vitals Dr. Patel named", () => {
    expect(VITALS.length).toBeGreaterThanOrEqual(11);
    const keys = VITALS.map((v) => v.key);
    for (const k of ["hr", "bp", "spo2", "rr", "temp", "weight", "hrv", "apnea", "glucose", "steps", "sleep"]) {
      expect(keys).toContain(k);
    }
  });

  it("models blood pressure as a single mmHg def and has unique keys + emoji", () => {
    const bp = vitalByKey("bp")!;
    expect(bp.unit).toBe("mmHg");
    const seen = new Set<string>();
    for (const v of VITALS) {
      expect(seen.has(v.key)).toBe(false);
      seen.add(v.key);
      expect(v.emoji.length).toBeGreaterThan(0);
      expect(v.title.length).toBeGreaterThan(0);
    }
  });
});

describe("vitalByKey", () => {
  it("resolves case-insensitively and returns undefined for unknown keys", () => {
    expect(vitalByKey("HR")?.title).toBe("Heart Rate");
    expect(vitalByKey("zzz")).toBeUndefined();
  });
});

describe("isVitalAbnormal", () => {
  it("flags out-of-range and accepts in-range values", () => {
    const spo2 = vitalByKey("spo2")!;
    expect(isVitalAbnormal(spo2, 88)).toBe(true);
    expect(isVitalAbnormal(spo2, 98)).toBe(false);
    const hr = vitalByKey("hr")!;
    expect(isVitalAbnormal(hr, 120)).toBe(true);
  });

  it("never flags an unbounded vital like weight", () => {
    const weight = vitalByKey("weight")!;
    expect(isVitalAbnormal(weight, 350)).toBe(false);
  });
});
