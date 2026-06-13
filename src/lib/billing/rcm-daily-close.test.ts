import { describe, expect, it } from "vitest";
import { aggregateClose, dailyDigestText, findExceptions } from "./rcm-daily-close";

const day = (s: string) => new Date(s);

const closeDay = day("2026-04-15T23:59:00Z");

const baseInputs = () => ({
  closeDate: closeDay,
  claims: [],
  payments: [],
  adjustments: [],
  arBuckets: { b0_30: 100000, b31_60: 50000, b61_90: 25000, b91_120: 10000, b120plus: 5000 },
  eraFiles: [],
  bankDeposits: [],
  appealPackets: [],
  pendingTakebacks: [],
});

describe("aggregateClose", () => {
  it("counts claim transitions on the close date only", () => {
    const row = aggregateClose({
      ...baseInputs(),
      claims: [
        {
          id: "c1",
          status: "paid",
          // RECON-2: serviceDate is weeks before the close, but the claim was
          // BILLED (created) on the close day — so it counts here.
          createdAt: day("2026-04-15T09:00:00Z"),
          serviceDate: day("2026-04-01T10:00:00Z"),
          submittedAt: day("2026-04-15T11:00:00Z"),
          paidAt: day("2026-04-15T15:00:00Z"),
          deniedAt: null,
          closedAt: null,
          closureType: null,
          billedAmountCents: 20000,
          allowedAmountCents: 15000,
          paidAmountCents: 12500,
          patientRespCents: 2500,
          timelyFilingDeadline: null,
        },
        {
          id: "c2",
          status: "denied",
          createdAt: day("2026-04-14T10:00:00Z"), // billed the prior day
          serviceDate: day("2026-04-14T10:00:00Z"),
          submittedAt: day("2026-04-15T11:00:00Z"),
          paidAt: null,
          deniedAt: day("2026-04-15T16:00:00Z"),
          closedAt: null,
          closureType: null,
          billedAmountCents: 30000,
          allowedAmountCents: 0,
          paidAmountCents: 0,
          patientRespCents: 0,
          timelyFilingDeadline: null,
        },
      ],
      // RECON-1: cash is attributed by paymentDate. Only the $125 insurance
      // payment lands on the close day; the off-day payment and the non-cash
      // "adjustment" source are excluded.
      payments: [
        { amountCents: 12500, source: "insurance", paymentDate: day("2026-04-15T15:00:00Z") },
        { amountCents: 9999, source: "insurance", paymentDate: day("2026-04-14T15:00:00Z") },
        { amountCents: 500, source: "adjustment", paymentDate: day("2026-04-15T15:00:00Z") },
      ],
    });
    expect(row.claimsCreated).toBe(1); // only c1 was billed (createdAt) on close day
    expect(row.claimsSubmitted).toBe(2);
    expect(row.claimsPaid).toBe(1);
    expect(row.claimsDenied).toBe(1);
    expect(row.billedCents).toBe(20000); // c1 only — by createdAt, not serviceDate
    expect(row.paidCents).toBe(12500); // close-day insurance cash only
  });

  it("rolls AR buckets straight through", () => {
    const row = aggregateClose(baseInputs());
    expect(row.arBucket0to30).toBe(100000);
    expect(row.arBucket31to60).toBe(50000);
    expect(row.outstandingArCents).toBe(190000);
  });

  it("counts written_off claims by closureType", () => {
    const row = aggregateClose({
      ...baseInputs(),
      claims: [
        {
          id: "wo",
          status: "written_off",
          createdAt: day("2026-04-15"),
          serviceDate: day("2026-04-15"),
          submittedAt: null,
          paidAt: null,
          deniedAt: null,
          closedAt: day("2026-04-15T20:00:00Z"),
          closureType: "written_off",
          billedAmountCents: 0,
          allowedAmountCents: null,
          paidAmountCents: 0,
          patientRespCents: 0,
          timelyFilingDeadline: null,
        },
      ],
    });
    expect(row.claimsWrittenOff).toBe(1);
  });
});

describe("findExceptions", () => {
  it("flags claims submitted > 30d ago without adjudication", () => {
    const e = findExceptions({
      ...baseInputs(),
      claims: [
        {
          id: "stale",
          status: "submitted",
          createdAt: day("2026-03-05"),
          serviceDate: day("2026-03-01"),
          submittedAt: day("2026-03-05"),
          paidAt: null,
          deniedAt: null,
          closedAt: null,
          closureType: null,
          billedAmountCents: 10000,
          allowedAmountCents: null,
          paidAmountCents: 0,
          patientRespCents: 0,
          timelyFilingDeadline: null,
        },
      ],
    });
    expect(e.find((x) => x.kind === "stale_claim")?.ref).toBe("stale");
  });

  it("flags unmatched / variance bank deposits", () => {
    const e = findExceptions({
      ...baseInputs(),
      bankDeposits: [
        { id: "d1", status: "unmatched" },
        { id: "d2", status: "matched" },
        { id: "d3", status: "variance" },
        { id: "d4", status: "partially_matched" },
      ],
    });
    const refs = e.filter((x) => x.kind === "unmatched_deposit").map((x) => x.ref);
    expect(refs).toEqual(["d1", "d3", "d4"]);
  });

  it("flags appeals submitted > 45d ago with no response", () => {
    const e = findExceptions({
      ...baseInputs(),
      appealPackets: [
        { id: "a1", status: "submitted", submittedAt: day("2026-02-01") },
        { id: "a2", status: "submitted", submittedAt: day("2026-04-10") }, // recent
        { id: "a3", status: "approved_for_submission", submittedAt: null }, // not submitted
      ],
    });
    const refs = e.filter((x) => x.kind === "overdue_appeal").map((x) => x.ref);
    expect(refs).toEqual(["a1"]);
  });
});

describe("dailyDigestText", () => {
  it("includes activity, money, AR, and exception sections", () => {
    const row = aggregateClose({
      ...baseInputs(),
      claims: [
        {
          id: "c1",
          status: "paid",
          createdAt: closeDay,
          serviceDate: closeDay,
          submittedAt: closeDay,
          paidAt: closeDay,
          deniedAt: null,
          closedAt: null,
          closureType: null,
          billedAmountCents: 20000,
          allowedAmountCents: 15000,
          paidAmountCents: 15000,
          patientRespCents: 0,
          timelyFilingDeadline: null,
        },
      ],
    });
    const txt = dailyDigestText(row, []);
    expect(txt).toContain("Daily RCM close");
    expect(txt).toContain("Activity");
    expect(txt).toContain("AR by bucket");
    expect(txt).toContain("Clean close");
  });

  it("lists up to 20 exceptions then summarises the remainder", () => {
    const exceptions = Array.from({ length: 23 }, (_, i) => ({
      kind: "stale_claim" as const,
      ref: `c${i}`,
      detail: "stale",
      ageDays: 40,
    }));
    const row = aggregateClose(baseInputs());
    const txt = dailyDigestText(row, exceptions);
    expect(txt).toContain("…and 3 more");
  });
});
