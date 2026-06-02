import { describe, expect, it } from "vitest";
import {
  buildNsfReversalEvents,
  nsfTone,
  summarizeNsfImpact,
  type BouncedPayment,
} from "./nsf-handler";

const bounced = (over: Partial<BouncedPayment> = {}): BouncedPayment => ({
  paymentId: "pay_1",
  claimId: "clm_1",
  patientId: "pat_1",
  organizationId: "org_1",
  amountCents: 12_500,
  occurredAt: new Date("2026-05-01T00:00:00Z"),
  reason: "R01 NSF",
  bankFeeCents: 0,
  type: "nsf",
  ...over,
});

describe("buildNsfReversalEvents", () => {
  it("reverses the original payment as a negative chargeback entry", () => {
    const p = buildNsfReversalEvents(bounced());
    expect(p.ledgerEntries).toHaveLength(1);
    expect(p.ledgerEntries[0].eventType).toBe("chargeback");
    expect(p.ledgerEntries[0].amountCents).toBe(-12_500);
    // Patient now owes the reversed amount again (positive delta).
    expect(p.patientBalanceDeltaCents).toBe(12_500);
  });

  it("normalizes sign even if a positive amount is passed in", () => {
    const p = buildNsfReversalEvents(bounced({ amountCents: 12_500 }));
    expect(p.ledgerEntries[0].amountCents).toBeLessThan(0);
    expect(p.adjustment?.amountCents).toBeLessThan(0);
  });

  it("adds a separate negative ledger entry for the bank fee when present", () => {
    const p = buildNsfReversalEvents(bounced({ bankFeeCents: 3_000 }));
    expect(p.ledgerEntries).toHaveLength(2);
    expect(p.ledgerEntries[1].amountCents).toBe(-3_000);
    expect(p.ledgerEntries[1].metadata.bankFee).toBe(true);
    expect(p.bankFeeImpactCents).toBe(3_000);
  });

  it("emits a takeback adjustment that re-opens the claim balance when a claim is attached", () => {
    const p = buildNsfReversalEvents(bounced({ claimId: "clm_9" }));
    expect(p.adjustment).not.toBeNull();
    expect(p.adjustment?.type).toBe("takeback");
    expect(p.adjustment?.amountCents).toBe(-12_500);
  });

  it("omits the claim adjustment for an unattached (patient-direct) payment", () => {
    const p = buildNsfReversalEvents(bounced({ claimId: null }));
    expect(p.adjustment).toBeNull();
    // The ledger reversal still fires so the patient ledger stays balanced.
    expect(p.ledgerEntries[0].amountCents).toBe(-12_500);
  });

  it("labels the description by event type", () => {
    expect(buildNsfReversalEvents(bounced({ type: "chargeback" })).ledgerEntries[0].description).toContain(
      "Issuer chargeback",
    );
    expect(buildNsfReversalEvents(bounced({ type: "reversal" })).ledgerEntries[0].description).toContain(
      "Clearinghouse reversal",
    );
  });
});

describe("nsfTone", () => {
  it("stays neutral when there was never an NSF", () => {
    expect(nsfTone({ hadPriorNsf: false, cyclesSinceNsf: 0, totalAttempts: 9 })).toBe("neutral");
  });

  it("uses the supportive tone for the first outreach after an NSF", () => {
    expect(nsfTone({ hadPriorNsf: true, cyclesSinceNsf: 0, totalAttempts: 1 })).toBe("supportive_nsf");
    expect(nsfTone({ hadPriorNsf: true, cyclesSinceNsf: 1, totalAttempts: 2 })).toBe("supportive_nsf");
  });

  it("escalates to final_notice only after several attempts", () => {
    expect(nsfTone({ hadPriorNsf: true, cyclesSinceNsf: 2, totalAttempts: 4 })).toBe("final_notice");
  });

  it("is firm in between supportive and final", () => {
    expect(nsfTone({ hadPriorNsf: true, cyclesSinceNsf: 2, totalAttempts: 2 })).toBe("firm");
  });
});

describe("summarizeNsfImpact", () => {
  it("rolls up counts, dollars, fees, and unresolved across types", () => {
    const r = summarizeNsfImpact([
      { type: "nsf", amountCents: 10_000, bankFeeCents: 2_500, resolved: false },
      { type: "chargeback", amountCents: 5_000, bankFeeCents: 0, resolved: true },
      { type: "chargeback", amountCents: 7_500, bankFeeCents: 1_500, resolved: false },
    ]);
    expect(r.count).toBe(3);
    expect(r.totalReversedCents).toBe(22_500);
    expect(r.totalBankFeesCents).toBe(4_000);
    expect(r.unresolved).toBe(2);
    expect(r.byType.chargeback.count).toBe(2);
    expect(r.byType.chargeback.reversedCents).toBe(12_500);
    expect(r.byType.reversal.count).toBe(0);
  });

  it("returns a clean zeroed rollup for no events", () => {
    const r = summarizeNsfImpact([]);
    expect(r.count).toBe(0);
    expect(r.totalReversedCents).toBe(0);
    expect(r.unresolved).toBe(0);
    expect(r.byType.nsf.count).toBe(0);
  });
});
