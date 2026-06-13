import { describe, expect, it } from "vitest";
import { computeAllowedCents, sumContractualAdjustmentsCents } from "./era-ingest";
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
