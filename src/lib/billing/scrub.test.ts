import { describe, expect, it } from "vitest";
import { scrubClaim, isClaimSubmittable, type ScrubInput } from "./scrub";

const DOS = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);

function baseInput(over: Partial<ScrubInput> = {}): ScrubInput {
  return {
    cptCodes: [{ code: "99213", label: "Office visit", units: 1, chargeAmount: 150, modifiers: [] }],
    icd10Codes: [{ code: "M54.50", label: "Low back pain" }],
    payerName: "Aetna",
    payerId: "60054",
    serviceDate: DOS(7),
    providerId: "1234567893",
    ...over,
  };
}

describe("scrubClaim — NCCI mod-25 placement (regression for C-1)", () => {
  it("PASSES a 99214+99406 claim when mod-25 is on the E/M code", () => {
    // CMS rule: modifier 25 attaches to the comprehensive E/M, NOT to the
    // bundled counseling code. Pre-fix this case fired a false-positive.
    const issues = scrubClaim(
      baseInput({
        payerName: "Blue Cross Blue Shield",
        payerId: "bcbs",
        cptCodes: [
          { code: "99214", label: "Office visit, est pt", units: 1, chargeAmount: 235, modifiers: ["25"] },
          { code: "99406", label: "Tobacco cessation 3-10 min", units: 1, chargeAmount: 24, modifiers: [] },
        ],
      }),
    );
    expect(issues.filter((i) => i.ruleCode === "NCCI_BUNDLED_PAIR")).toHaveLength(0);
  });

  it("FLAGS a 99214+99406 claim when mod-25 is mis-placed on the counseling code", () => {
    // Mod-25 on the component is wrong per CMS — payer will still bundle.
    const issues = scrubClaim(
      baseInput({
        payerName: "Blue Cross Blue Shield",
        payerId: "bcbs",
        cptCodes: [
          { code: "99214", label: "Office visit, est pt", units: 1, chargeAmount: 235, modifiers: [] },
          { code: "99406", label: "Tobacco cessation 3-10 min", units: 1, chargeAmount: 24, modifiers: ["25"] },
        ],
      }),
    );
    expect(issues.find((i) => i.ruleCode === "NCCI_BUNDLED_PAIR")).toBeDefined();
  });

  it("FLAGS a 99213+99406 claim with no mod-25 anywhere", () => {
    const issues = scrubClaim(
      baseInput({
        cptCodes: [
          { code: "99213", label: "Office visit", units: 1, chargeAmount: 185, modifiers: [] },
          { code: "99406", label: "Tobacco cessation", units: 1, chargeAmount: 24, modifiers: [] },
        ],
      }),
    );
    expect(issues.find((i) => i.ruleCode === "NCCI_BUNDLED_PAIR")).toBeDefined();
  });

  it("BLOCKS unbundleable pairs (36415 + 99213) regardless of modifiers (regression)", () => {
    const issues = scrubClaim(
      baseInput({
        cptCodes: [
          { code: "99213", label: "Office visit", units: 1, chargeAmount: 185, modifiers: ["25"] },
          { code: "36415", label: "Venipuncture", units: 1, chargeAmount: 15, modifiers: ["59"] },
        ],
      }),
    );
    const ncci = issues.find((i) => i.ruleCode === "NCCI_BUNDLED_PAIR");
    expect(ncci).toBeDefined();
    expect(ncci!.severity).toBe("error");
    expect(ncci!.blocksSubmission).toBe(true);
  });
});

describe("scrubClaim — NCCI severity escalation by payer (regression for C-4)", () => {
  it("escalates to ERROR when the payer does NOT honor mod-25 on Z71 (UHC)", () => {
    // UnitedHealthcare's policy: mod-25 on counseling pairs is not honored.
    // Submitting without mod-25 is guaranteed to be denied — block.
    const issues = scrubClaim(
      baseInput({
        payerName: "UnitedHealthcare",
        payerId: "uhc",
        cptCodes: [
          { code: "99213", label: "Office visit", units: 1, chargeAmount: 185, modifiers: [] },
          { code: "99406", label: "Tobacco cessation", units: 1, chargeAmount: 24, modifiers: [] },
        ],
      }),
    );
    const ncci = issues.find((i) => i.ruleCode === "NCCI_BUNDLED_PAIR");
    expect(ncci).toBeDefined();
    expect(ncci!.severity).toBe("error");
    expect(ncci!.blocksSubmission).toBe(true);
  });

  it("stays a WARNING when the payer DOES honor mod-25 on Z71 (Aetna)", () => {
    const issues = scrubClaim(
      baseInput({
        payerName: "Aetna",
        payerId: "60054",
        cptCodes: [
          { code: "99213", label: "Office visit", units: 1, chargeAmount: 185, modifiers: [] },
          { code: "99406", label: "Tobacco cessation", units: 1, chargeAmount: 24, modifiers: [] },
        ],
      }),
    );
    const ncci = issues.find((i) => i.ruleCode === "NCCI_BUNDLED_PAIR");
    expect(ncci).toBeDefined();
    expect(ncci!.severity).toBe("warning");
    expect(ncci!.blocksSubmission).toBe(false);
  });

  it("escalates for a UHC ALIAS ('United Healthcare', no payerId) — was a warning pre-fix", () => {
    // The pre-fix code matched the literal string "UnitedHealthcare"; an
    // alias like "United Healthcare" (with a space) slipped through and was
    // wrongly downgraded to a warning. resolvePayerRule maps the alias to
    // UHC (honorsMod25OnZ71 = false), so it must escalate to a blocking error.
    const issues = scrubClaim(
      baseInput({
        payerName: "United Healthcare",
        payerId: null,
        cptCodes: [
          { code: "99213", label: "Office visit", units: 1, chargeAmount: 185, modifiers: [] },
          { code: "99406", label: "Tobacco cessation", units: 1, chargeAmount: 24, modifiers: [] },
        ],
      }),
    );
    const ncci = issues.find((i) => i.ruleCode === "NCCI_BUNDLED_PAIR");
    expect(ncci).toBeDefined();
    expect(ncci!.severity).toBe("error");
    expect(ncci!.blocksSubmission).toBe(true);
  });

  it("applies the UHC mod-25 policy to HRA pairs (96160), not just 9940x", () => {
    // Pre-fix the escalation was narrowed to componentCode.startsWith("9940"),
    // so the health-risk-assessment bundle 96160+E/M was missed for UHC.
    const issues = scrubClaim(
      baseInput({
        payerName: "UnitedHealthcare",
        payerId: "uhc",
        cptCodes: [
          { code: "99213", label: "Office visit", units: 1, chargeAmount: 185, modifiers: [] },
          { code: "96160", label: "Health risk assessment", units: 1, chargeAmount: 20, modifiers: [] },
        ],
      }),
    );
    const ncci = issues.find((i) => i.ruleCode === "NCCI_BUNDLED_PAIR");
    expect(ncci).toBeDefined();
    expect(ncci!.severity).toBe("error");
    expect(ncci!.blocksSubmission).toBe(true);
  });
});

describe("scrubClaim — self-pay short-circuit (regression for C-2)", () => {
  it("PASSES a cash-pay cannabis cert with no payer", () => {
    const issues = scrubClaim({
      cptCodes: [{ code: "S0339", label: "Cannabis certification", units: 1, chargeAmount: 250, modifiers: [] }],
      icd10Codes: [{ code: "G89.4" }, { code: "F12.20" }],
      payerName: null,
      payerId: null,
      serviceDate: DOS(0),
      providerId: "1234567893",
      authRequired: true,
      authNumber: null,
      selfPay: true,
    });
    // No payer-only blockers fire
    expect(issues.find((i) => i.ruleCode === "MISSING_PAYER")).toBeUndefined();
    expect(issues.find((i) => i.ruleCode === "MISSING_PRIOR_AUTH")).toBeUndefined();
    expect(issues.find((i) => i.ruleCode === "CANNABIS_PAYER_PA_REQUIRED")).toBeUndefined();
    expect(issues.find((i) => i.ruleCode === "PAST_TIMELY_FILING")).toBeUndefined();
    expect(isClaimSubmittable(issues)).toBe(true);
  });

  it("STILL enforces coding rules (MUE, NCCI, missing dx) on self-pay", () => {
    const issues = scrubClaim({
      cptCodes: [{ code: "99213", label: "Office visit", units: 5, chargeAmount: 185, modifiers: [] }],
      icd10Codes: [],
      payerName: null,
      payerId: null,
      serviceDate: DOS(0),
      providerId: "1234567893",
      selfPay: true,
    });
    expect(issues.find((i) => i.ruleCode === "MUE_EXCEEDED")).toBeDefined();
    expect(issues.find((i) => i.ruleCode === "MISSING_DIAGNOSIS")).toBeDefined();
  });

  it("STILL blocks when the rendering provider is missing on self-pay", () => {
    const issues = scrubClaim({
      cptCodes: [{ code: "S0339", label: "Cannabis cert", units: 1, chargeAmount: 250, modifiers: [] }],
      icd10Codes: [{ code: "G89.4" }],
      payerName: null,
      payerId: null,
      serviceDate: DOS(0),
      providerId: null,
      selfPay: true,
    });
    expect(issues.find((i) => i.ruleCode === "MISSING_PROVIDER")).toBeDefined();
  });
});

describe("scrubClaim — CANNABIS_PA_HOLD workflow hint (regression for C-3)", () => {
  it("emits CANNABIS_PA_HOLD with create_pa_task hint for Aetna cannabis without auth", () => {
    // Aetna covers cannabis WITH prior auth (excludesCannabis=false,
    // requiresPriorAuthForCannabis=true). Pre-fix this fired the legacy
    // CANNABIS_PAYER_PA_REQUIRED with no workflow signal.
    const issues = scrubClaim(
      baseInput({
        cptCodes: [{ code: "99214", label: "Office visit", units: 1, chargeAmount: 235, modifiers: [] }],
        icd10Codes: [{ code: "G89.4" }, { code: "F12.20" }],
        authRequired: false,
        authNumber: null,
      }),
    );
    const paHold = issues.find((i) => i.ruleCode === "CANNABIS_PA_HOLD");
    expect(paHold).toBeDefined();
    expect(paHold!.workflowHint).toBe("create_pa_task");
    expect(paHold!.blocksSubmission).toBe(true);
    // Legacy code should NOT fire (Aetna doesn't exclude)
    expect(issues.find((i) => i.ruleCode === "CANNABIS_PAYER_EXCLUDES")).toBeUndefined();
  });

  it("emits CANNABIS_PAYER_EXCLUDES with route_to_self_pay hint for Medicare cannabis", () => {
    const issues = scrubClaim(
      baseInput({
        payerName: "Medicare",
        payerId: "medicare",
        cptCodes: [{ code: "99214", label: "Office visit", units: 1, chargeAmount: 235, modifiers: [] }],
        icd10Codes: [{ code: "G89.4" }, { code: "F12.21" }],
      }),
    );
    const excl = issues.find((i) => i.ruleCode === "CANNABIS_PAYER_EXCLUDES");
    expect(excl).toBeDefined();
    expect(excl!.workflowHint).toBe("route_to_self_pay");
    // No PA_HOLD when the payer excludes — there's no PA to obtain
    expect(issues.find((i) => i.ruleCode === "CANNABIS_PA_HOLD")).toBeUndefined();
  });
});

describe("scrubClaim — timely filing (regression coverage)", () => {
  it("blocks PAST_TIMELY_FILING for Anthem at 95d (window 90d)", () => {
    const issues = scrubClaim(
      baseInput({
        payerName: "Anthem",
        payerId: "anthem",
        serviceDate: DOS(95),
      }),
    );
    const tf = issues.find((i) => i.ruleCode === "PAST_TIMELY_FILING");
    expect(tf).toBeDefined();
    expect(tf!.blocksSubmission).toBe(true);
  });

  it("warns APPROACHING_TIMELY_FILING in the last 20% of the window", () => {
    const issues = scrubClaim(
      baseInput({
        payerName: "Anthem",
        payerId: "anthem",
        serviceDate: DOS(78),
      }),
    );
    const tf = issues.find((i) => i.ruleCode === "APPROACHING_TIMELY_FILING");
    expect(tf).toBeDefined();
    expect(tf!.severity).toBe("warning");
  });
});
