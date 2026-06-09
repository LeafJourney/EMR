/**
 * EMR-872 — Vitals catalog with multi-source capture
 *
 * Dr. Patel's vitals redesign treats the EMR as a hub for *both* in-office
 * vitals and wearable / RPM streams (Garmin, Apple Watch, Whoop, CGM, remote
 * patient monitoring). Each vital sign is a named definition with its unit,
 * normal envelope, and emoji so the chart can render delightful, color-coded
 * tiles and the AI brief can speak about trends.
 *
 * Date/time is handled by the UI; this pure layer just owns the catalog and
 * the abnormal-flag helper. No React, no project imports.
 */

export type VitalSource =
  | "In office"
  | "Garmin"
  | "iWatch"
  | "Whoop"
  | "CGM"
  | "RPM";

export const VITAL_SOURCES: readonly VitalSource[] = [
  "In office",
  "Garmin",
  "iWatch",
  "Whoop",
  "CGM",
  "RPM",
];

export interface VitalDef {
  key: string; // "hr"
  title: string; // "Heart Rate"
  unit: string; // "bpm"
  normalLow?: number;
  normalHigh?: number;
  emoji: string;
}

export const VITALS: readonly VitalDef[] = [
  {
    key: "hr",
    title: "Heart Rate",
    unit: "bpm",
    normalLow: 60,
    normalHigh: 100,
    emoji: "❤️",
  },
  {
    // Blood pressure modeled as one def; systolic/diastolic captured by UI.
    key: "bp",
    title: "Blood Pressure",
    unit: "mmHg",
    normalLow: 90,
    normalHigh: 120,
    emoji: "🩺",
  },
  {
    key: "spo2",
    title: "O2 Saturation",
    unit: "%",
    normalLow: 95,
    normalHigh: 100,
    emoji: "🫁",
  },
  {
    key: "rr",
    title: "Respiratory Rate",
    unit: "breaths/min",
    normalLow: 12,
    normalHigh: 20,
    emoji: "💨",
  },
  {
    key: "temp",
    title: "Temperature",
    unit: "°F",
    normalLow: 97.0,
    normalHigh: 99.5,
    emoji: "🌡️",
  },
  {
    key: "weight",
    title: "Weight",
    unit: "lb",
    emoji: "⚖️",
  },
  {
    key: "hrv",
    title: "Heart Rate Variability",
    unit: "ms",
    normalLow: 20,
    normalHigh: 200,
    emoji: "📈",
  },
  {
    key: "apnea",
    title: "Sleep Apnea Score",
    unit: "AHI",
    normalLow: 0,
    normalHigh: 5,
    emoji: "😮‍💨",
  },
  {
    key: "glucose",
    title: "Blood Glucose",
    unit: "mg/dL",
    normalLow: 70,
    normalHigh: 140,
    emoji: "🩸",
  },
  {
    key: "steps",
    title: "Steps",
    unit: "steps",
    normalLow: 5000,
    normalHigh: 20000,
    emoji: "👟",
  },
  {
    key: "sleep",
    title: "Sleep Hours",
    unit: "hr",
    normalLow: 7,
    normalHigh: 9,
    emoji: "🛌",
  },
];

/** Look up a vital definition by its stable key. */
export function vitalByKey(key: string): VitalDef | undefined {
  const needle = key.trim().toLowerCase();
  return VITALS.find((v) => v.key.toLowerCase() === needle);
}

/**
 * Is a measured value outside the normal envelope? A vital with no defined
 * bounds (e.g. raw weight) is never flagged.
 */
export function isVitalAbnormal(def: VitalDef, value: number): boolean {
  if (def.normalLow !== undefined && value < def.normalLow) return true;
  if (def.normalHigh !== undefined && value > def.normalHigh) return true;
  return false;
}
