import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — wired up before importing the module under test so the server
// action sees the mocked prisma/auth/gateway instead of the real ones.
//
// vi.mock is hoisted above imports; use vi.hoisted for shared state so the
// mock factories can reach it at hoist-time.
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    patient: {
      findFirst: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    claim: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    financialEvent: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    paymentPlan: {
      findFirst: vi.fn(),
    },
  };

  const mockUser = {
    id: "user_1",
    email: "clin@example.com",
    firstName: "Cli",
    lastName: "Nician",
    roles: ["clinician"] as string[],
    organizationId: "org_1" as string | null,
    organizationName: "Leaf Clinic",
  };

  const requireUserMock = vi.fn(async () => mockUser);

  const mockGateway = {
    name: "stub",
    createPaymentIntent: vi.fn(),
    chargeStoredMethod: vi.fn(),
    capturePayment: vi.fn(),
    refund: vi.fn(),
    createPaymentLink: vi.fn(),
    verifyToken: vi.fn(),
    verifyWebhookSignature: vi.fn(() => true),
    parseWebhook: vi.fn(),
  };

  const createPlanMock = vi.fn();

  return { mockPrisma, mockUser, requireUserMock, mockGateway, createPlanMock };
});

const { mockPrisma, mockUser, requireUserMock, mockGateway, createPlanMock } = hoisted;

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: hoisted.mockPrisma,
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: () => hoisted.requireUserMock(),
}));

vi.mock("@/lib/payments", () => ({
  resolvePaymentGateway: () => hoisted.mockGateway,
}));

vi.mock("@/lib/billing/payment-plans", () => ({
  createPlan: hoisted.createPlanMock,
}));

// ---------------------------------------------------------------------------
// Import AFTER the mocks are in place.
// ---------------------------------------------------------------------------

import { collectCopay, collectPayment, createPaymentPlanAction } from "./actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fd(values: Record<string, string | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined) f.append(k, v);
  }
  return f;
}

function resetAll() {
  vi.clearAllMocks();
  mockUser.roles = ["clinician"];
  mockUser.organizationId = "org_1";
  requireUserMock.mockImplementation(async () => mockUser);
  mockGateway.createPaymentIntent.mockResolvedValue({
    id: "intent_1",
    clientReferenceId: "crid",
    amountCents: 5000,
    status: "captured",
    method: "card",
    last4: "4242",
    brand: "visa",
  });
}

// ---------------------------------------------------------------------------
// collectCopay
// ---------------------------------------------------------------------------

describe("collectCopay", () => {
  beforeEach(resetAll);

  it("rejects when the patient belongs to a different org", async () => {
    // findFirst is scoped to {id, organizationId: 'org_1'} — a cross-org
    // patient returns null.
    mockPrisma.patient.findFirst.mockResolvedValue(null);

    const result = await collectCopay("patient_foreign", 2500, "card");

    expect(result).toEqual({ ok: false, error: "Patient not found." });
    expect(mockPrisma.financialEvent.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects a zero amount", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue({ id: "patient_1" });

    const result = await collectCopay("patient_1", 0, "card");

    expect(result.ok).toBe(false);
    expect(mockPrisma.financialEvent.createMany).not.toHaveBeenCalled();
  });

  it("rejects a negative amount", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue({ id: "patient_1" });

    const result = await collectCopay("patient_1", -100, "card");

    expect(result.ok).toBe(false);
    expect(mockPrisma.financialEvent.createMany).not.toHaveBeenCalled();
  });

  it("rejects an absurdly large amount (> $5000)", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue({ id: "patient_1" });

    // $5000.01 — just above the 500000-cent cap.
    const result = await collectCopay("patient_1", 500001, "card");

    expect(result.ok).toBe(false);
    expect(mockPrisma.financialEvent.createMany).not.toHaveBeenCalled();
  });

  it("happy path: writes FinancialEvents (both attributed) + AuditLog", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue({ id: "patient_1" });
    mockPrisma.financialEvent.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });

    const result = await collectCopay("patient_1", 2500, "card");

    expect(result.ok).toBe(true);

    // Both FinancialEvents have createdByUserId populated.
    expect(mockPrisma.financialEvent.createMany).toHaveBeenCalledTimes(1);
    const feArgs = mockPrisma.financialEvent.createMany.mock.calls[0][0];
    expect(feArgs.data).toHaveLength(2);
    for (const row of feArgs.data) {
      expect(row.createdByUserId).toBe("user_1");
      expect(row.organizationId).toBe("org_1");
      expect(row.patientId).toBe("patient_1");
      expect(row.amountCents).toBe(2500);
    }
    expect(feArgs.data.map((r: { type: string }) => r.type).sort()).toEqual([
      "copay_assessed",
      "copay_collected",
    ]);

    // AuditLog written.
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArgs = mockPrisma.auditLog.create.mock.calls[0][0];
    expect(auditArgs.data).toMatchObject({
      organizationId: "org_1",
      actorUserId: "user_1",
      action: "patient.copay.collected",
      subjectType: "Patient",
      subjectId: "patient_1",
    });
    expect(auditArgs.data.metadata).toMatchObject({
      amountCents: 2500,
      method: "card",
    });
  });
});

// ---------------------------------------------------------------------------
// collectCopay — role gate (EMR-1111: same allowlist as collectPayment)
// ---------------------------------------------------------------------------

describe("collectCopay — role gate", () => {
  beforeEach(resetAll);

  it("allows front_office to collect a copay", async () => {
    mockUser.roles = ["front_office"];
    mockPrisma.patient.findFirst.mockResolvedValue({ id: "patient_1" });
    mockPrisma.financialEvent.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });

    const result = await collectCopay("patient_1", 2500, "cash");

    expect(result.ok).toBe(true);
    expect(mockPrisma.financialEvent.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a role outside the desk-collection allowlist (midlevel)", async () => {
    mockUser.roles = ["midlevel"];

    const result = await collectCopay("patient_1", 2500, "cash");

    expect(result).toEqual({ ok: false, error: "Unauthorized" });
    // Denied before any data access or writes.
    expect(mockPrisma.patient.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.financialEvent.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createPaymentPlanAction — desk enrollment allowlist (FO-M5, EMR-1109)
// ---------------------------------------------------------------------------

describe("createPaymentPlanAction — role gate", () => {
  beforeEach(resetAll);

  it("allows front_office to enroll a payment plan", async () => {
    mockUser.roles = ["front_office"];
    mockPrisma.patient.findFirst.mockResolvedValue({ id: "patient_1" });
    mockPrisma.paymentPlan.findFirst.mockResolvedValue(null);
    createPlanMock.mockResolvedValue({
      plan: { id: "plan_1" },
      installmentCount: 6,
    });
    mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });

    const result = await createPaymentPlanAction(
      null,
      fd({
        patientId: "patient_1",
        totalAmountCents: "60000",
        installmentAmountCents: "10000",
        frequency: "monthly",
        startDate: "2026-07-01",
        autopayEnabled: "on",
      }),
    );

    expect(result).toEqual({ ok: true, planId: "plan_1", installmentCount: 6 });
    expect(createPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        patientId: "patient_1",
        totalAmountCents: 60000,
        installmentAmountCents: 10000,
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "patient.payment_plan.created" }),
      }),
    );
  });

  it("returns a structured Unauthorized error (surfaced by the form) for roles off the allowlist", async () => {
    mockUser.roles = ["back_office"];

    const result = await createPaymentPlanAction(
      null,
      fd({
        patientId: "patient_1",
        totalAmountCents: "60000",
        installmentAmountCents: "10000",
        frequency: "monthly",
        startDate: "2026-07-01",
      }),
    );

    expect(result).toEqual({ ok: false, error: "Unauthorized" });
    expect(createPlanMock).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// collectPayment — idempotency + audit trail
// ---------------------------------------------------------------------------

describe("collectPayment", () => {
  beforeEach(resetAll);

  it("rejects when the patient belongs to a different org", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(null);

    const result = await collectPayment(
      null,
      fd({
        patientId: "patient_foreign",
        amountCents: "5000",
        method: "card",
        idempotencyKey: "idk-cross-org",
      }),
    );

    expect(result).toEqual({ ok: false, error: "Patient not found." });
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    expect(mockPrisma.financialEvent.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("duplicate idempotency key returns existing payment ID without creating a new row", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue({
      id: "patient_1",
      firstName: "Alex",
      lastName: "Jones",
    });
    // Short-circuit on existing payment.
    mockPrisma.payment.findFirst.mockResolvedValue({ id: "payment_existing" });

    const result = await collectPayment(
      null,
      fd({
        patientId: "patient_1",
        amountCents: "5000",
        method: "card",
        idempotencyKey: "idk-same-submit",
      }),
    );

    expect(result).toEqual({ ok: true, paymentId: "payment_existing" });

    // No new writes — gateway untouched, no new Payment, no new ledger rows.
    expect(mockGateway.createPaymentIntent).not.toHaveBeenCalled();
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    expect(mockPrisma.financialEvent.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();

    // Lookup was scoped to the supplied key.
    const lookupArgs = mockPrisma.payment.findFirst.mock.calls[0][0];
    expect(lookupArgs.where.reference).toBe("idk-same-submit");
  });

  it("rejects a zero amount via Zod bounds", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue({
      id: "patient_1",
      firstName: "Alex",
      lastName: "Jones",
    });

    const result = await collectPayment(
      null,
      fd({
        patientId: "patient_1",
        amountCents: "0",
        method: "card",
        idempotencyKey: "idk-zero",
      }),
    );

    expect(result.ok).toBe(false);
    expect(mockGateway.createPaymentIntent).not.toHaveBeenCalled();
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
  });

  it("rejects an absurd amount (> $5000)", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue({
      id: "patient_1",
      firstName: "Alex",
      lastName: "Jones",
    });

    const result = await collectPayment(
      null,
      fd({
        patientId: "patient_1",
        amountCents: "500001",
        method: "card",
        idempotencyKey: "idk-absurd",
      }),
    );

    expect(result.ok).toBe(false);
    expect(mockGateway.createPaymentIntent).not.toHaveBeenCalled();
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
  });

  it("happy path: creates Payment + FinancialEvent (attributed) + AuditLog", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue({
      id: "patient_1",
      firstName: "Alex",
      lastName: "Jones",
    });
    mockPrisma.payment.findFirst.mockResolvedValue(null);
    mockPrisma.claim.findFirst.mockResolvedValue({
      id: "claim_1",
      patientRespCents: 5000,
    });
    mockPrisma.payment.create.mockResolvedValue({ id: "payment_new" });
    mockPrisma.financialEvent.create.mockResolvedValue({ id: "fe_1" });
    mockPrisma.claim.update.mockResolvedValue({ id: "claim_1" });
    mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });

    const result = await collectPayment(
      null,
      fd({
        patientId: "patient_1",
        amountCents: "5000",
        method: "card",
        idempotencyKey: "idk-happy",
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.paymentId).toBe("payment_new");

    // Payment row stores the idempotency key as reference.
    const paymentArgs = mockPrisma.payment.create.mock.calls[0][0];
    expect(paymentArgs.data.reference).toBe("idk-happy");
    expect(paymentArgs.data.claimId).toBe("claim_1");
    expect(paymentArgs.data.amountCents).toBe(5000);

    // FinancialEvent has createdByUserId.
    const feArgs = mockPrisma.financialEvent.create.mock.calls[0][0];
    expect(feArgs.data.createdByUserId).toBe("user_1");
    expect(feArgs.data.organizationId).toBe("org_1");
    expect(feArgs.data.type).toBe("patient_payment");
    expect(feArgs.data.paymentId).toBe("payment_new");

    // AuditLog written.
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArgs = mockPrisma.auditLog.create.mock.calls[0][0];
    expect(auditArgs.data).toMatchObject({
      organizationId: "org_1",
      actorUserId: "user_1",
      action: "patient.payment.collected",
      subjectType: "Patient",
      subjectId: "patient_1",
    });
    expect(auditArgs.data.metadata).toMatchObject({
      amountCents: 5000,
      method: "card",
      paymentReference: "idk-happy",
      paymentId: "payment_new",
      claimId: "claim_1",
    });
  });

  it("server-generates a strong idempotency key when the client omits one", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue({
      id: "patient_1",
      firstName: "Alex",
      lastName: "Jones",
    });
    mockPrisma.payment.findFirst.mockResolvedValue(null);
    mockPrisma.claim.findFirst.mockResolvedValue({
      id: "claim_1",
      patientRespCents: 5000,
    });
    mockPrisma.payment.create.mockResolvedValue({ id: "payment_new" });
    mockPrisma.financialEvent.create.mockResolvedValue({ id: "fe_1" });
    mockPrisma.claim.update.mockResolvedValue({ id: "claim_1" });
    mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });

    const result = await collectPayment(
      null,
      fd({
        patientId: "patient_1",
        amountCents: "5000",
        method: "card",
        // no idempotencyKey
      }),
    );

    expect(result.ok).toBe(true);

    // The payment reference must look like our pmt_<uuid> prefix and
    // must NOT be a predictable Math.random string.
    const paymentArgs = mockPrisma.payment.create.mock.calls[0][0];
    const ref: string = paymentArgs.data.reference;
    expect(ref).toMatch(/^pmt_[0-9a-f-]{36}$/);
  });
});
