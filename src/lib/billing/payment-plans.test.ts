import { describe, expect, it } from "vitest";
import {
  computeAdjustedInstallmentCount,
  computeInstallmentCharge,
  parseNoteTag,
  planInstallmentSchedule,
  upsertNoteTag,
} from "./payment-plans";

describe("planInstallmentSchedule", () => {
  it("splits an evenly-divisible balance into level installments", () => {
    // $1,000 at $250/mo → 4 even installments, no remainder.
    const s = planInstallmentSchedule(100_000, 25_000);
    expect(s.installmentCount).toBe(4);
    expect(s.finalInstallmentCents).toBe(25_000);
  });

  it("puts the remainder on the final installment when it doesn't divide evenly", () => {
    // $1,000 at $300/mo → 3 × $300 + a $100 final = 4 installments.
    const s = planInstallmentSchedule(100_000, 30_000);
    expect(s.installmentCount).toBe(4);
    expect(s.finalInstallmentCents).toBe(10_000);
  });

  it("keeps the sum of all installments exactly equal to the total (penny-accurate)", () => {
    const total = 99_999;
    const level = 17_000;
    const { installmentCount, finalInstallmentCents } = planInstallmentSchedule(total, level);
    const summed = level * (installmentCount - 1) + finalInstallmentCents;
    expect(summed).toBe(total);
  });
});

describe("computeInstallmentCharge", () => {
  it("charges the level amount for a non-final installment", () => {
    const charge = computeInstallmentCharge({
      totalAmountCents: 100_000,
      installmentAmountCents: 25_000,
      installmentsPaid: 1,
      numberOfInstallments: 4,
      paidAmountCents: 25_000,
    });
    expect(charge).toBe(25_000);
  });

  it("trues the final installment up to the exact remaining balance", () => {
    // 3 of 4 paid ($750 collected) on a $1,000 plan → final pulls $250.
    const charge = computeInstallmentCharge({
      totalAmountCents: 100_000,
      installmentAmountCents: 25_000,
      installmentsPaid: 3,
      numberOfInstallments: 4,
      paidAmountCents: 75_000,
    });
    expect(charge).toBe(25_000);
  });

  it("regression: final installment stays correct after modifyInstallment changed the level amount", () => {
    // $1,000 plan. First 2 installments paid at the original $250 ($500),
    // then the patient raised the installment to $300. After paying one
    // $300 installment, $800 is collected and $200 remains. The final
    // pull MUST be the true $200 remaining — not
    // total − newLevel × installmentsPaid = 100000 − 30000×3 = $100,
    // which would mark the plan paid-in-full while $100 is still owed.
    const charge = computeInstallmentCharge({
      totalAmountCents: 100_000,
      installmentAmountCents: 30_000,
      installmentsPaid: 3,
      numberOfInstallments: 4,
      paidAmountCents: 80_000,
    });
    expect(charge).toBe(20_000);
  });

  it("never returns a negative charge if the plan is already overpaid", () => {
    const charge = computeInstallmentCharge({
      totalAmountCents: 100_000,
      installmentAmountCents: 25_000,
      installmentsPaid: 4,
      numberOfInstallments: 4,
      paidAmountCents: 105_000,
    });
    expect(charge).toBe(0);
  });
});

describe("computeAdjustedInstallmentCount", () => {
  it("re-levels the remaining balance on top of installments already paid", () => {
    // $1,000 plan, 2 × $250 paid ($500). Re-level remaining $500 to $100/ea →
    // 5 more installments, on top of the 2 already paid = 7 total.
    const count = computeAdjustedInstallmentCount(
      { installmentsPaid: 2, totalAmountCents: 100_000, paidAmountCents: 50_000 },
      10_000,
    );
    expect(count).toBe(7);
  });

  it("rounds a non-even remainder up to a full installment", () => {
    // $530 remaining at $200 → ceil(2.65) = 3 remaining + 0 paid = 3.
    const count = computeAdjustedInstallmentCount(
      { installmentsPaid: 0, totalAmountCents: 53_000, paidAmountCents: 0 },
      20_000,
    );
    expect(count).toBe(3);
  });

  it("guarantees at least one remaining installment when nothing is left", () => {
    const count = computeAdjustedInstallmentCount(
      { installmentsPaid: 4, totalAmountCents: 100_000, paidAmountCents: 100_000 },
      25_000,
    );
    expect(count).toBe(5); // 4 paid + a floor of 1
  });
});

describe("upsertNoteTag / parseNoteTag", () => {
  it("adds a tag line to an empty notes blob and reads it back", () => {
    const notes = upsertNoteTag(null, "REMINDER", "weekly");
    expect(notes).toBe("REMINDER: weekly");
    expect(parseNoteTag(notes, "REMINDER")).toBe("weekly");
  });

  it("replaces an existing tag without disturbing other lines", () => {
    const start = "MISSED: 2026-05-01 — declined\nREMINDER: weekly";
    const next = upsertNoteTag(start, "REMINDER", "1_day");
    expect(next).toBe("MISSED: 2026-05-01 — declined\nREMINDER: 1_day");
    expect(parseNoteTag(next, "REMINDER")).toBe("1_day");
    expect(parseNoteTag(next, "MISSED")).toBe("2026-05-01 — declined");
  });

  it("returns null for an absent tag", () => {
    expect(parseNoteTag("PAUSED: hardship", "REMINDER")).toBeNull();
  });
});
