import { describe, it, expect } from "vitest";
import { signChange, applyChange } from "./communication";

// EMR-805: signing or applying a medication change must be scoped to the
// caller's org. A request id from another org must resolve to "not found"
// (the lookup is now findFirst({ id, organizationId })) and must not mutate
// anything. We inject a fake transaction that records writes.

function fakeDb(req: { id: string; organizationId: string }) {
  const calls = { signoffCreate: 0, requestUpdate: 0, medicationUpdate: 0, audit: 0 };
  const tx = {
    medicationChangeRequest: {
      findFirst: async ({ where }: { where: any }) =>
        where.id === req.id && where.organizationId === req.organizationId
          ? { ...req, status: "proposed", signoffs: [], appliedAt: null, medicationId: null, afterJson: {} }
          : null,
      update: async () => {
        calls.requestUpdate++;
        return {};
      },
    },
    medicationChangeSignoff: {
      create: async () => {
        calls.signoffCreate++;
        return {};
      },
    },
    patientMedication: {
      update: async () => {
        calls.medicationUpdate++;
        return {};
      },
      create: async () => ({}),
    },
    auditLog: {
      create: async () => {
        calls.audit++;
        return {};
      },
    },
  };
  const db = { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) };
  return { db: db as never, calls };
}

describe("signChange org scoping", () => {
  it("refuses a request id from another org and writes nothing", async () => {
    const { db, calls } = fakeDb({ id: "req1", organizationId: "org-A" });
    await expect(
      signChange(db, {
        requestId: "req1",
        organizationId: "org-B", // wrong org
        party: "pharmacist",
        decision: "approve",
        signedById: "u1",
        signedName: "Dr. Test",
      }),
    ).rejects.toThrow(/not found/i);
    expect(calls.signoffCreate).toBe(0);
    expect(calls.requestUpdate).toBe(0);
  });
});

describe("applyChange org scoping", () => {
  it("refuses a request id from another org and never touches a medication", async () => {
    const { db, calls } = fakeDb({ id: "req1", organizationId: "org-A" });
    await expect(
      applyChange(db, {
        requestId: "req1",
        organizationId: "org-B", // wrong org
        appliedById: "u1",
      }),
    ).rejects.toThrow(/not found/i);
    expect(calls.medicationUpdate).toBe(0);
  });
});
