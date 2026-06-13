import { describe, expect, it } from "vitest";
import { computeAllowedCents, sumContractualAdjustmentsCents } from "./era-ingest";
import { reconcileClaimTotals, classifyAdjustment } from "./remittance";
import type { Era835ClaimPayment } from "./era-parser";

// Regression for ERA-1 / ERA-2: the contractual write-off (totalAdjustedCents)
// must NOT include patient-responsibility (PR) CAS rows, and the allowed
// amount must equal paid + patient-responsibility — not paid + PR + every
// adjustment, which previously overstated allowed above the billed charge and
// silently wrote patient balances off as contractual.

function claim(overrides: Partial<Era835ClaimPayment> = {}): Era835ClaimPayment {
  return {
    claimControlNumber: "CLM1",
    payerClaimId: null,
    claimStatusCode: "1",
    totalChargeCents: 20000,
    totalPaidCents: 15000,
    patientRespCents: 4000,
    claimAdjustments: [
      { groupCode: "CO", carcCode: "45", amountCents: 1000, quantity: 1 }, // contractual
      { groupCode: "PR", carcCode: "1", amountCents: 4000, quantity: 1 }, // patient deductible
    ],
    serviceLines: [],
    ...overrides,
  };
}

describe("era-ingest money math (regression for ERA-1 / ERA-2)", () => {
  it("excludes PR from the contractual write-off", () => {
    // charge 200 = paid 150 + CO 10 + PR 40. Contractual = CO only = $10.
    expect(sumContractualAdjustmentsCents(claim())).toBe(1000);
  });

  it("allowed = paid + patient responsibility (not + all adjustments)", () => {
    // Allowed = contracted rate = paid 150 + PR 40 = $190 = charge - contractual.
    expect(computeAllowedCents(claim())).toBe(19000);
    expect(computeAllowedCents(claim())).toBeLessThanOrEqual(claim().totalChargeCents);
  });

  it("the claim balances: charge = paid + PR + contractual", () => {
    const c = claim();
    const balanced =
      c.totalPaidCents + c.patientRespCents + sumContractualAdjustmentsCents(c);
    expect(balanced).toBe(c.totalChargeCents);
  });

  it("counts line-level contractual adjustments but still excludes line PR", () => {
    const c = claim({
      claimAdjustments: [],
      serviceLines: [
        {
          cptCode: "99214",
          modifiers: [],
          chargeCents: 20000,
          paidCents: 15000,
          units: 1,
          adjustments: [
            { groupCode: "CO", carcCode: "45", amountCents: 1000, quantity: 1 },
            { groupCode: "PR", carcCode: "2", amountCents: 4000, quantity: 1 },
          ],
        },
      ],
    });
    expect(sumContractualAdjustmentsCents(c)).toBe(1000);
  });

  it("a reversal's negative CAS backs out a prior write-off (signed, not abs)", () => {
    const c = claim({
      claimAdjustments: [{ groupCode: "CO", carcCode: "45", amountCents: -1000, quantity: 1 }],
    });
    expect(sumContractualAdjustmentsCents(c)).toBe(-1000);
  });
});

// The adjudication agent's balance check now uses
//   adjustmentsCents = totalAdjustedCents + totalPatientRespCents
// (NOT + totalDeniedCents). These tests pin that formula via the same pure
// reconcileClaimTotals the agent calls.
describe("ERA balance check formula (regression for ERA-3)", () => {
  it("a well-formed remit balances as billed = paid + contractual + PR", () => {
    const c = claim(); // 20000 = 15000 + CO 1000 + PR 4000
    const adjustmentsCents = sumContractualAdjustmentsCents(c) + c.patientRespCents;
    expect(
      reconcileClaimTotals({
        billedCents: c.totalChargeCents,
        paidCents: c.totalPaidCents,
        adjustmentsCents,
      }).balanced,
    ).toBe(true);
  });

  it("does NOT re-add denied amounts (a denial is already inside contractual)", () => {
    // Full recoverable-CO denial: paid 0, the whole charge is a non-PR adj.
    const c = claim({
      totalPaidCents: 0,
      patientRespCents: 0,
      claimAdjustments: [{ groupCode: "CO", carcCode: "50", amountCents: 20000, quantity: 1 }],
    });
    const adjustmentsCents = sumContractualAdjustmentsCents(c) + c.patientRespCents; // 20000, not 40000
    expect(
      reconcileClaimTotals({
        billedCents: c.totalChargeCents,
        paidCents: c.totalPaidCents,
        adjustmentsCents,
      }).balanced,
    ).toBe(true);
  });

  it("still flags a genuinely dropped CAS segment", () => {
    const c = claim(); // forgot the contractual 1000 below
    expect(
      reconcileClaimTotals({
        billedCents: c.totalChargeCents,
        paidCents: c.totalPaidCents,
        adjustmentsCents: c.patientRespCents,
      }).balanced,
    ).toBe(false);
  });
});

// The agent creates a DenialEvent only when classifyAdjustment is recoverable
// AND the group isn't PR. These pin the gate (regression for ERA-4 — OA-23
// COB lines were spawning spurious denials).
describe("ERA denial gating (regression for ERA-4)", () => {
  it("skips OA-23 prior-payer impact (normal COB, not a denial)", () => {
    const cls = classifyAdjustment({ groupCode: "OA", carcCode: "23", amountCents: 8000 });
    expect(cls.group).toBe("OA");
    expect(cls.recoverable).toBe(false);
  });

  it("skips pure contractual CO-45", () => {
    expect(classifyAdjustment({ groupCode: "CO", carcCode: "45", amountCents: 1000 }).recoverable).toBe(false);
  });

  it("keeps recoverable denials (CO-16 missing info, CO-197 no auth, CO-50 med-nec)", () => {
    for (const carc of ["16", "197", "50"]) {
      expect(classifyAdjustment({ groupCode: "CO", carcCode: carc, amountCents: 5000 }).recoverable).toBe(true);
    }
  });

  it("never treats PR as a denial", () => {
    expect(classifyAdjustment({ groupCode: "PR", carcCode: "1", amountCents: 4000 }).group).toBe("PR");
  });
});

// Underpayment variance now subtracts patient responsibility from expected,
// so a balanced cost-share remit is not flagged.
describe("ERA underpayment variance (excludes patient responsibility)", () => {
  it("a balanced remit with a copay/deductible is NOT underpaid", () => {
    const c = claim(); // payer paid exactly its share
    const expectedPayer = c.totalChargeCents - sumContractualAdjustmentsCents(c) - c.patientRespCents;
    expect(expectedPayer - c.totalPaidCents).toBe(0); // old formula gave 4000 → false positive
  });

  it("flags a genuine payer shortfall", () => {
    const c = claim({ totalPaidCents: 12000 }); // payer shorted us $30
    const expectedPayer = c.totalChargeCents - sumContractualAdjustmentsCents(c) - c.patientRespCents;
    expect(expectedPayer - c.totalPaidCents).toBeGreaterThan(500);
  });
});
