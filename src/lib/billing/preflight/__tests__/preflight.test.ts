import { describe, expect, it } from "vitest";
import {
  computeLcdConcordance,
  computePayerDenialHistory,
  extractNarrativeFeatures,
  type ClaimOutcomeRow,
  type EncounterContext,
  type PreflightClaim,
} from "../features";
import { GREEN_THRESHOLD, HOLD_THRESHOLD, computePDenial } from "../score";
import { PREFLIGHT_LCD_RULES } from "../rules";
import { runPreflight } from "../engine";
import {
  appendModifier25,
  remediateAndRescore,
  removeComponentLine,
} from "../remediate";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AS_OF = new Date("2026-06-12T12:00:00Z");
const DOS = new Date("2026-06-05T12:00:00Z");

const GOOD_NOTE = `Established patient returns for follow-up of generalized anxiety disorder.
Reports worsening anxiety over the past month with panic episodes twice weekly. Sleep remains
fragmented with early-morning awakening; insomnia noted. Denies chest pain or palpitations.
No shortness of breath. Appetite stable, no nausea. Reports fatigue most mornings.
Exam: alert, mood anxious, affect congruent. Blood pressure 124/78.
Medication adjusted: increased sertraline from 50mg to 75mg daily; discussed side effect
profile and titration plan. Reviewed sleep hygiene and breathing exercises. Patient
verbalized understanding. Follow up in four weeks to reassess response; will consider
therapy referral if symptoms persist. Total time 28 minutes spent on the date of the
encounter, over half in counseling.`;

const INJECTION_NOTE = `Established patient seen for worsening generalized anxiety with panic
episodes and poor sleep. In addition to the scheduled vitamin B12 injection for documented
deficiency, a separately identifiable evaluation was performed: medication adjusted,
sertraline dose increased to 100mg, side effect profile reviewed. Denies chest pain or
shortness of breath. Reports fatigue and reduced appetite. Exam: anxious mood, normal gait,
blood pressure 122/76. Plan: titrate over four weeks, follow up to reassess.
Total time 30 minutes.`;

const THIN_HEADACHE_NOTE =
  "Patient reports headache for two weeks. Requests imaging of the head. Plan: order brain MRI to evaluate.";

const MIGRAINE_NOTE = `Chronic migraine, worsening despite preventive therapy. Headache
frequency increased to 15 days per month. Sleep disrupted. Medication adjusted: topiramate
dose increased. Plan: order brain MRI.`;

function claim(overrides: Partial<PreflightClaim> = {}): PreflightClaim {
  return {
    claimId: "claim-1",
    payerName: "Blue Cross Blue Shield",
    payerId: "bcbs",
    serviceDate: DOS,
    serviceLines: [
      { code: "99214", label: "Office visit, est pt", units: 1, chargeAmount: 235, modifiers: [] },
    ],
    icd10Codes: [{ code: "F41.1", label: "Generalized anxiety disorder" }],
    ...overrides,
  };
}

function ctx(narrativeNote: string): EncounterContext {
  return { narrativeNote, providerId: "prov-1" };
}

function historyRows(args: {
  cptCode: string;
  denied: number;
  paid: number;
  daysAgo: number;
  payerName?: string;
}): ClaimOutcomeRow[] {
  const adjudicatedAt = new Date(AS_OF.getTime() - args.daysAgo * 86_400_000);
  const rows: ClaimOutcomeRow[] = [];
  for (let i = 0; i < args.denied; i++) {
    rows.push({ payerName: args.payerName ?? "Aetna", cptCode: args.cptCode, outcome: "denied", adjudicatedAt });
  }
  for (let i = 0; i < args.paid; i++) {
    rows.push({ payerName: args.payerName ?? "Aetna", cptCode: args.cptCode, outcome: "paid", adjudicatedAt });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 1. Clean claim → green release
// ---------------------------------------------------------------------------

describe("pre-flight: clean claim", () => {
  it("scores below the 0.10 green threshold and releases", () => {
    const result = runPreflight(claim(), ctx(GOOD_NOTE), { asOf: AS_OF });
    expect(result.features.xCci).toBe(0);
    expect(result.features.modifierGap).toBe(0);
    expect(result.features.deltaLcd).toBe(0); // 99214 + F41.1 is an approved LCD pair
    expect(result.score.score).toBeLessThan(GREEN_THRESHOLD);
    expect(result.score.disposition).toBe("release");
    expect(result.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Modifier deficiency: 99214 + 96372 without Modifier-25
// ---------------------------------------------------------------------------

describe("pre-flight: 99214 + 96372 without Modifier-25", () => {
  const modClaim = claim({
    payerName: "Aetna",
    payerId: "60054",
    serviceLines: [
      { code: "99214", label: "Office visit, est pt", units: 1, chargeAmount: 235, modifiers: [] },
      { code: "96372", label: "Therapeutic injection", units: 1, chargeAmount: 45, modifiers: [] },
    ],
    icd10Codes: [
      { code: "F41.1", label: "Generalized anxiety disorder" },
      { code: "D51.9", label: "Vitamin B12 deficiency anemia" },
    ],
  });

  it("holds the claim (≥ 0.35) and attributes modifier_deficiency", () => {
    const result = runPreflight(modClaim, ctx(INJECTION_NOTE), { asOf: AS_OF });
    expect(result.features.modifierGap).toBe(1);
    expect(result.features.xCci).toBe(0); // fixable with a modifier, not a hard unbundle
    expect(result.score.score).toBeGreaterThanOrEqual(HOLD_THRESHOLD);
    expect(result.score.disposition).toBe("hold");

    const top = result.findings[0];
    expect(top.category).toBe("modifier_deficiency");
    expect(top.remediation).toContain("Append Modifier-25");
    expect(top.remediation).toContain("separate evaluation");
    expect(top.action).toEqual({ kind: "append_modifier", targetCode: "99214", modifier: "25" });
  });

  it("one-click appendModifier25 re-scores below 0.10 and releases", () => {
    const result = runPreflight(modClaim, ctx(INJECTION_NOTE), { asOf: AS_OF });
    const run = remediateAndRescore(modClaim, ctx(INJECTION_NOTE), result.findings[0].action, {
      asOf: AS_OF,
    });
    expect(run.before.score.disposition).toBe("hold");
    expect(run.after.features.modifierGap).toBe(0);
    expect(run.after.score.score).toBeLessThan(GREEN_THRESHOLD);
    expect(run.after.score.disposition).toBe("release");
    expect(run.released).toBe(true);
    // The fix is immutable — the original claim is untouched.
    expect(modClaim.serviceLines[0].modifiers).toEqual([]);
    expect(run.claim.serviceLines[0].modifiers).toEqual(["25"]);
  });

  it("appendModifier25 helper targets the E/M line by default", () => {
    const fixed = appendModifier25(modClaim);
    expect(fixed.serviceLines.find((l) => l.code === "99214")?.modifiers).toEqual(["25"]);
    expect(fixed.serviceLines.find((l) => l.code === "96372")?.modifiers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Unbundling conflict: hard NCCI pair (xCci = 1)
// ---------------------------------------------------------------------------

describe("pre-flight: NCCI unbundling pair", () => {
  const bundledClaim = claim({
    payerName: "Aetna",
    payerId: "60054",
    serviceLines: [
      { code: "99214", label: "Office visit, est pt", units: 1, chargeAmount: 235, modifiers: [] },
      { code: "36415", label: "Venipuncture", units: 1, chargeAmount: 12, modifiers: [] },
    ],
  });

  it("flags xCci = 1, holds, and attributes unbundling_conflict", () => {
    const result = runPreflight(bundledClaim, ctx(GOOD_NOTE), { asOf: AS_OF });
    expect(result.features.xCci).toBe(1);
    expect(result.score.score).toBeGreaterThanOrEqual(HOLD_THRESHOLD);
    expect(result.score.disposition).toBe("hold");

    const top = result.findings[0];
    expect(top.category).toBe("unbundling_conflict");
    expect(top.remediation).toContain("Consolidate the component line item");
    expect(top.action).toEqual({ kind: "remove_line", componentCode: "36415" });
  });

  it("consolidating the component line re-scores green", () => {
    const result = runPreflight(bundledClaim, ctx(GOOD_NOTE), { asOf: AS_OF });
    const run = remediateAndRescore(bundledClaim, ctx(GOOD_NOTE), result.findings[0].action, {
      asOf: AS_OF,
    });
    expect(run.after.features.xCci).toBe(0);
    expect(run.after.score.disposition).toBe("release");
    expect(run.claim.serviceLines.map((l) => l.code)).toEqual(["99214"]);
    // removeComponentLine directly agrees with the dispatched action
    expect(removeComponentLine(bundledClaim, "36415").serviceLines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Medical necessity deficit: brain MRI for plain headache
// ---------------------------------------------------------------------------

describe("pre-flight: 70553 Brain MRI for plain headache (R51)", () => {
  const mriClaim = claim({
    payerName: "Aetna",
    payerId: "60054",
    serviceLines: [
      { code: "70553", label: "MRI brain w/ + w/o contrast", units: 1, chargeAmount: 1450, modifiers: [] },
    ],
    icd10Codes: [{ code: "R51.9", label: "Headache, unspecified" }],
  });

  it("computes high LCD discordance + low narrative score and holds", () => {
    const result = runPreflight(mriClaim, ctx(THIN_HEADACHE_NOTE), { asOf: AS_OF });
    expect(result.features.deltaLcd).toBeGreaterThan(0.8);
    expect(result.features.phiNarrative.score).toBeLessThan(0.4);
    expect(result.score.score).toBeGreaterThanOrEqual(HOLD_THRESHOLD);
    expect(result.score.disposition).toBe("hold");

    const top = result.findings[0];
    expect(top.category).toBe("medical_necessity_deficit");
    expect(top.remediation).toContain("Document required criteria");
    expect(top.remediation).toContain("treatment failure");
    expect(top.action.kind).toBe("augment_documentation");
  });

  it("documenting the missing red-flag criteria lowers the score", () => {
    const result = runPreflight(mriClaim, ctx(THIN_HEADACHE_NOTE), { asOf: AS_OF });
    const run = remediateAndRescore(mriClaim, ctx(THIN_HEADACHE_NOTE), result.findings[0].action, {
      asOf: AS_OF,
    });
    expect(run.after.score.score).toBeLessThan(run.before.score.score);
    expect(run.after.features.deltaLcd).toBeLessThan(run.before.features.deltaLcd);
  });
});

// ---------------------------------------------------------------------------
// 5. Payer-history weighting shifts a borderline claim
// ---------------------------------------------------------------------------

describe("pre-flight: vPayer rolling 180-day history", () => {
  const borderlineClaim = claim({
    payerName: "Aetna",
    payerId: "60054",
    serviceLines: [
      { code: "70553", label: "MRI brain w/ + w/o contrast", units: 1, chargeAmount: 1450, modifiers: [] },
    ],
    icd10Codes: [{ code: "G43.719", label: "Chronic migraine, intractable" }],
  });

  it("is borderline (review) with no payer history", () => {
    const result = runPreflight(borderlineClaim, ctx(MIGRAINE_NOTE), { asOf: AS_OF });
    expect(result.score.score).toBeGreaterThanOrEqual(GREEN_THRESHOLD);
    expect(result.score.score).toBeLessThan(HOLD_THRESHOLD);
    expect(result.score.disposition).toBe("review");
  });

  it("a payer denying 60% of 70553 in-window pushes the claim into hold", () => {
    const base = runPreflight(borderlineClaim, ctx(MIGRAINE_NOTE), { asOf: AS_OF });
    const withHistory = runPreflight(borderlineClaim, ctx(MIGRAINE_NOTE), {
      asOf: AS_OF,
      payerHistory: historyRows({ cptCode: "70553", denied: 12, paid: 8, daysAgo: 30 }),
    });
    expect(withHistory.features.vPayer).toBeGreaterThan(base.features.vPayer);
    expect(withHistory.score.score).toBeGreaterThan(base.score.score);
    expect(withHistory.score.disposition).toBe("hold");
    expect(withHistory.findings.some((f) => f.category === "payer_history_risk")).toBe(true);
  });

  it("ignores outcomes outside the rolling 180-day window", () => {
    const base = runPreflight(borderlineClaim, ctx(MIGRAINE_NOTE), { asOf: AS_OF });
    const withStale = runPreflight(borderlineClaim, ctx(MIGRAINE_NOTE), {
      asOf: AS_OF,
      payerHistory: historyRows({ cptCode: "70553", denied: 12, paid: 8, daysAgo: 200 }),
    });
    expect(withStale.score.score).toBe(base.score.score);
  });

  it("ignores other payers' outcomes", () => {
    const base = runPreflight(borderlineClaim, ctx(MIGRAINE_NOTE), { asOf: AS_OF });
    const otherPayer = runPreflight(borderlineClaim, ctx(MIGRAINE_NOTE), {
      asOf: AS_OF,
      payerHistory: historyRows({
        cptCode: "70553",
        denied: 12,
        paid: 8,
        daysAgo: 30,
        payerName: "UnitedHealthcare",
      }),
    });
    expect(otherPayer.score.score).toBe(base.score.score);
  });
});

// ---------------------------------------------------------------------------
// 6. Feature-extraction unit tests
// ---------------------------------------------------------------------------

describe("extractNarrativeFeatures", () => {
  it("counts organ systems, tiers MDM, and detects Mod-25 evidence", () => {
    const f = extractNarrativeFeatures(INJECTION_NOTE);
    expect(f.organSystemCount).toBeGreaterThanOrEqual(5);
    expect(f.mdmTier).toBe(2); // "worsening" / "medication adjusted"
    expect(f.mod25Evidence).toBe(true); // "separately identifiable"
    expect(f.score).toBeGreaterThan(0.6);
  });

  it("scores a thin note low with no Mod-25 evidence", () => {
    const f = extractNarrativeFeatures(THIN_HEADACHE_NOTE);
    expect(f.organSystemCount).toBe(1); // neurological (headache)
    expect(f.mdmTier).toBe(0);
    expect(f.mod25Evidence).toBe(false);
    expect(f.score).toBeLessThan(0.4);
  });

  it("handles an empty narrative", () => {
    const f = extractNarrativeFeatures("");
    expect(f.score).toBe(0);
    expect(f.wordCount).toBe(0);
  });
});

describe("computePayerDenialHistory", () => {
  it("smooths small samples toward the 8% industry prior", () => {
    const result = computePayerDenialHistory({
      rows: historyRows({ cptCode: "99214", denied: 1, paid: 0, daysAgo: 10 }),
      payerName: "Aetna",
      cptCodes: ["99214"],
      asOf: AS_OF,
    });
    // (1 + 0.08*5) / (1 + 5) ≈ 0.233 — far from a naive 100% rate
    expect(result.rate).toBeGreaterThan(0.2);
    expect(result.rate).toBeLessThan(0.3);
    expect(result.sampleSize).toBe(1);
  });

  it("returns the prior when there is no history at all", () => {
    const result = computePayerDenialHistory({
      rows: [],
      payerName: "Aetna",
      cptCodes: ["99214"],
      asOf: AS_OF,
    });
    expect(result.rate).toBe(0.08);
    expect(result.sampleSize).toBe(0);
  });

  it("takes the worst CPT on a multi-line claim", () => {
    const result = computePayerDenialHistory({
      rows: [
        ...historyRows({ cptCode: "99214", denied: 0, paid: 20, daysAgo: 15 }),
        ...historyRows({ cptCode: "70553", denied: 10, paid: 10, daysAgo: 15 }),
      ],
      payerName: "Aetna",
      cptCodes: ["99214", "70553"],
      asOf: AS_OF,
    });
    expect(result.worstCpt).toBe("70553");
  });
});

describe("computeLcdConcordance", () => {
  it("is 0.0 for a perfect coverage-pair match", () => {
    const { deltaLcd } = computeLcdConcordance(
      [{ code: "99214" }],
      [{ code: "F41.1" }],
      GOOD_NOTE,
      PREFLIGHT_LCD_RULES,
    );
    expect(deltaLcd).toBe(0);
  });

  it("escalates toward 1.0 for discordant pairs with missing documentation", () => {
    const { deltaLcd, lines } = computeLcdConcordance(
      [{ code: "70553" }],
      [{ code: "R51.9" }],
      THIN_HEADACHE_NOTE,
      PREFLIGHT_LCD_RULES,
    );
    expect(deltaLcd).toBe(1);
    expect(lines[0].icdConcordant).toBe(false);
    expect(lines[0].missingKeywords).toContain("treatment failure");
  });

  it("gives an unknown CPT a mild non-zero distance", () => {
    const { deltaLcd, lines } = computeLcdConcordance(
      [{ code: "G0463" }],
      [{ code: "F41.1" }],
      GOOD_NOTE,
      PREFLIGHT_LCD_RULES,
    );
    expect(deltaLcd).toBe(0.1);
    expect(lines[0].ruleMatched).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Score mechanics
// ---------------------------------------------------------------------------

describe("computePDenial", () => {
  it("returns per-feature contributions that sum to the logit", () => {
    const result = runPreflight(claim(), ctx(GOOD_NOTE), { asOf: AS_OF });
    const { score, breakdown, intercept } = result.score;
    const z = intercept + breakdown.reduce((s, c) => s + c.contribution, 0);
    expect(score).toBeCloseTo(1 / (1 + Math.exp(-z)), 3);
    expect(breakdown.map((c) => c.feature).sort()).toEqual(
      ["deltaLcd", "modifierGap", "narrativeDeficit", "vPayer", "xCci"].sort(),
    );
  });

  it("ranks the breakdown by contribution descending", () => {
    const features = runPreflight(
      claim({
        serviceLines: [
          { code: "99214", modifiers: [] },
          { code: "96372", modifiers: [] },
        ],
        icd10Codes: [{ code: "F41.1" }, { code: "D51.9" }],
      }),
      ctx(INJECTION_NOTE),
      { asOf: AS_OF },
    );
    const contributions = features.score.breakdown.map((c) => c.contribution);
    expect(contributions).toEqual([...contributions].sort((a, b) => b - a));
    expect(features.score.breakdown[0].feature).toBe("modifierGap");
  });
});
