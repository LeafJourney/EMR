import { describe, expect, it } from "vitest";
import {
  classifyMedicationAction,
  decomposeCarePlan,
  extractBehavioralTarget,
  extractDose,
  extractFastingWindow,
  extractMolecule,
  extractRoute,
  extractTiming,
  segmentPlan,
} from "./care-plan-decomposition";

describe("field extractors", () => {
  it("extracts dose with unit", () => {
    expect(extractDose("metformin 500 mg twice daily")).toBe("500 mg");
    expect(extractDose("CBD oil 0.25 mL under the tongue")).toBe("0.25 mL");
    expect(extractDose("continue walking")).toBeNull();
  });

  it("normalizes route to plain language", () => {
    expect(extractRoute("take PO")).toBe("by mouth");
    expect(extractRoute("place sublingual")).toBe("under the tongue");
    expect(extractRoute("2 puffs inhaled")).toBe("inhaled");
    expect(extractRoute("no route here")).toBeNull();
  });

  it("normalizes timing to plain language", () => {
    expect(extractTiming("BID")).toBe("twice daily");
    expect(extractTiming("take qhs")).toBe("at bedtime");
    expect(extractTiming("once daily")).toBe("once daily");
    expect(extractTiming("with food")).toBe("with meals");
  });

  it("classifies action verbs with correct precedence", () => {
    expect(classifyMedicationAction("start metformin")).toBe("INITIATE");
    expect(classifyMedicationAction("discontinue lisinopril")).toBe("DISCONTINUE");
    expect(classifyMedicationAction("taper off prednisone")).toBe("DISCONTINUE");
    expect(classifyMedicationAction("increase metformin to 1000 mg")).toBe("TITRATE");
    expect(classifyMedicationAction("continue atorvastatin")).toBe("MAINTAIN");
    expect(classifyMedicationAction("patient feels well")).toBeNull();
  });

  it("extracts molecules from the lexicon and after verbs", () => {
    expect(extractMolecule("start metformin 500 mg")).toBe("Metformin");
    expect(extractMolecule("begin CBD oil at night")?.toLowerCase()).toContain("cbd");
  });

  it("extracts fasting windows and behavioral targets", () => {
    expect(extractFastingWindow("14:10 intermittent fasting")).toBe("14:10");
    expect(extractFastingWindow("16/8 eating window")).toBe("16:8");
    expect(extractBehavioralTarget("walk for 30 minutes")).toBe("30 minutes");
    expect(extractBehavioralTarget("aim for 7-8 hours of sleep")).toBe("7-8 hours");
    expect(extractBehavioralTarget("target 10,000 steps")).toBe("10,000 steps");
  });
});

describe("segmentPlan", () => {
  it("splits bulleted plans", () => {
    const segs = segmentPlan("- Start metformin 500 mg\n- Begin 14:10 IF\n- Walk 30 min daily");
    expect(segs).toHaveLength(3);
    expect(segs[0]).toContain("metformin");
  });

  it("splits prose into sentences", () => {
    const segs = segmentPlan("Start metformin 500 mg twice daily. Recheck A1c in 3 months.");
    expect(segs).toHaveLength(2);
  });
});

// ── Fixture 1: metformin titration plan ──────────────────────────────────────
describe("fixture: metformin titration plan", () => {
  const plan = [
    "Start metformin 500 mg by mouth twice daily with meals.",
    "Plan to titrate metformin up to 1000 mg twice daily after two weeks if tolerated.",
    "Discontinue glipizide.",
    "Continue lisinopril 10 mg once daily.",
  ].join("\n");

  const result = decomposeCarePlan(plan);

  it("captures four medication actions and no diet/behavior noise", () => {
    expect(result.medications).toHaveLength(4);
    expect(result.dietary).toHaveLength(0);
    expect(result.behavioral).toHaveLength(0);
  });

  it("tags the initiate action with dose, route, and timing", () => {
    const initiate = result.medications.find((m) => m.action === "INITIATE");
    expect(initiate?.molecule).toBe("Metformin");
    expect(initiate?.dose).toBe("500 mg");
    expect(initiate?.route).toBe("by mouth");
    expect(initiate?.timing).toBe("twice daily");
  });

  it("tags the titration and discontinuation", () => {
    expect(result.medications.some((m) => m.action === "TITRATE" && m.dose === "1000 mg")).toBe(true);
    expect(result.medications.some((m) => m.action === "DISCONTINUE")).toBe(true);
    expect(result.medications.some((m) => m.action === "MAINTAIN")).toBe(true);
  });
});

// ── Fixture 2: 14:10 intermittent-fasting protocol ───────────────────────────
describe("fixture: 14:10 intermittent fasting protocol", () => {
  const plan = [
    "Begin a 14:10 intermittent fasting schedule, eating between 9am and 7pm.",
    "Aim for a low-carb, whole-food diet.",
    "Increase water intake to stay well hydrated.",
  ].join("\n");

  const result = decomposeCarePlan(plan);

  it("classifies all three as dietary, not medication", () => {
    expect(result.dietary).toHaveLength(3);
    expect(result.medications).toHaveLength(0);
  });

  it("captures the eating window and protocol kinds", () => {
    const tre = result.dietary.find((d) => d.window === "14:10");
    expect(tre).toBeDefined();
    expect(result.dietary.some((d) => d.kind === "macronutrient")).toBe(true);
    expect(result.dietary.some((d) => d.kind === "hydration")).toBe(true);
  });
});

// ── Fixture 3: walking + breathing behavioral plan ───────────────────────────
describe("fixture: walking + breathing behavioral plan", () => {
  const plan = [
    "Walk for 30 minutes daily, working up to Zone 2 cardio.",
    "Practice 10 minutes of breathing exercises each evening for stress reduction.",
    "Aim for 7-8 hours of sleep with a consistent bedtime routine.",
    "Log your blood pressure at home each morning.",
  ].join("\n");

  const result = decomposeCarePlan(plan);

  it("classifies all four as behavioral", () => {
    expect(result.behavioral).toHaveLength(4);
    expect(result.medications).toHaveLength(0);
    expect(result.dietary).toHaveLength(0);
  });

  it("captures behavioral kinds and quantified targets", () => {
    expect(result.behavioral.some((b) => b.kind === "activity" && b.target === "30 minutes")).toBe(true);
    expect(result.behavioral.some((b) => b.kind === "mindfulness")).toBe(true);
    expect(result.behavioral.some((b) => b.kind === "sleep" && b.target === "7-8 hours")).toBe(true);
    expect(result.behavioral.some((b) => b.kind === "monitoring")).toBe(true);
  });
});

describe("mixed plan + documentation artifacts", () => {
  it("routes prose with no care change to unclassified", () => {
    const result = decomposeCarePlan(
      "Patient is doing well overall. Start metformin 500 mg daily. Discussed goals.",
    );
    expect(result.medications).toHaveLength(1);
    expect(result.unclassified.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty buckets for empty input", () => {
    const result = decomposeCarePlan("");
    expect(result.medications).toEqual([]);
    expect(result.dietary).toEqual([]);
    expect(result.behavioral).toEqual([]);
    expect(result.unclassified).toEqual([]);
  });
});
