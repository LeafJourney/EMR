import { describe, it, expect } from "vitest";
import { summarizeTaxData } from "./tax-summary";

// Helper: UTC ms for a given Y-M-D.
const ms = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

describe("summarizeTaxData", () => {
  it("sums patient payments, charges, and responsibility", () => {
    const s = summarizeTaxData(
      2025,
      [
        { amountCents: 5000, paymentDateMs: ms(2025, 2, 10) },
        { amountCents: 2500, paymentDateMs: ms(2025, 5, 1) },
      ],
      [
        { serviceDateMs: ms(2025, 2, 9), cptLabel: "99213", billedCents: 15000, patientRespCents: 5000 },
        { serviceDateMs: ms(2025, 4, 30), cptLabel: "99214", billedCents: 20000, patientRespCents: 2500 },
      ],
    );
    expect(s.totalPatientPaidCents).toBe(7500);
    expect(s.totalChargedCents).toBe(35000);
    expect(s.totalPatientResponsibilityCents).toBe(7500);
    expect(s.visitCount).toBe(2);
  });

  it("buckets payments into the right calendar quarters", () => {
    const s = summarizeTaxData(
      2025,
      [
        { amountCents: 100, paymentDateMs: ms(2025, 1, 15) }, // Q1
        { amountCents: 200, paymentDateMs: ms(2025, 6, 30) }, // Q2
        { amountCents: 400, paymentDateMs: ms(2025, 9, 1) }, // Q3
        { amountCents: 800, paymentDateMs: ms(2025, 12, 31) }, // Q4
      ],
      [],
    );
    expect(s.quarters.map((q) => q.amountCents)).toEqual([100, 200, 400, 800]);
    expect(s.quarters.map((q) => q.count)).toEqual([1, 1, 1, 1]);
  });

  it("sorts service rows chronologically and preserves labels", () => {
    const s = summarizeTaxData(
      2025,
      [],
      [
        { serviceDateMs: ms(2025, 6, 1), cptLabel: "later", billedCents: 100, patientRespCents: 0 },
        { serviceDateMs: ms(2025, 1, 1), cptLabel: "earlier", billedCents: 200, patientRespCents: 0 },
      ],
    );
    expect(s.services.map((r) => r.cptLabel)).toEqual(["earlier", "later"]);
  });

  it("returns zeroed totals for a year with no activity", () => {
    const s = summarizeTaxData(2025, [], []);
    expect(s.totalPatientPaidCents).toBe(0);
    expect(s.visitCount).toBe(0);
    expect(s.quarters).toHaveLength(4);
    expect(s.quarters.every((q) => q.amountCents === 0 && q.count === 0)).toBe(true);
    expect(s.services).toEqual([]);
  });
});
