import { describe, expect, it } from "vitest";
import {
  aggregateOutstandingBalances,
  type ClaimForBalance,
} from "./patient-balances";

function claim(over: Partial<ClaimForBalance> = {}): ClaimForBalance {
  return {
    patientId: "p1",
    patientFirstName: "Maya",
    patientLastName: "Reyes",
    patientRespCents: 5000,
    payments: [],
    ...over,
  };
}

describe("aggregateOutstandingBalances", () => {
  it("returns the unpaid patient responsibility", () => {
    const out = aggregateOutstandingBalances([claim()]);
    expect(out).toEqual([
      { patientId: "p1", patientName: "Maya Reyes", owedCents: 5000 },
    ]);
  });

  it("subtracts only patient-source payments", () => {
    const out = aggregateOutstandingBalances([
      claim({
        payments: [
          { source: "patient", amountCents: 2000 },
          { source: "insurance", amountCents: 1000 },
        ],
      }),
    ]);
    expect(out[0].owedCents).toBe(3000);
  });

  it("sums multiple claims for one patient", () => {
    const out = aggregateOutstandingBalances([
      claim({ patientRespCents: 5000 }),
      claim({ patientRespCents: 2500, payments: [{ source: "patient", amountCents: 500 }] }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].owedCents).toBe(7000);
  });

  it("drops patients with no balance or a credit", () => {
    const out = aggregateOutstandingBalances([
      claim({ patientId: "paid", payments: [{ source: "patient", amountCents: 5000 }] }),
      claim({ patientId: "credit", patientRespCents: 1000, payments: [{ source: "patient", amountCents: 1500 }] }),
    ]);
    expect(out).toEqual([]);
  });

  it("sorts most-owed first", () => {
    const out = aggregateOutstandingBalances([
      claim({ patientId: "a", patientFirstName: "A", patientLastName: "A", patientRespCents: 1000 }),
      claim({ patientId: "b", patientFirstName: "B", patientLastName: "B", patientRespCents: 9000 }),
    ]);
    expect(out.map((b) => b.patientId)).toEqual(["b", "a"]);
  });
});
