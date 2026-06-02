import { beforeEach, describe, expect, it, vi } from "vitest";

// EMR-223 — contract admin server actions, Prisma + auth + cache mocked.

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    payerContract: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
  const mockUser = { id: "user_1", organizationId: "org_1" as string | null };
  const requireUserMock = vi.fn(async () => mockUser);
  return { mockPrisma, mockUser, requireUserMock };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: hoisted.requireUserMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockPrisma } = hoisted;

import { createContractAction, setContractActiveAction } from "./actions";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

const GOOD_CSV = "cpt_code,modifier,allowed_amount\n99213,,92.50\n99214,,130.00\n99214,95,124.00";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.payerContract.findUnique.mockResolvedValue(null);
  mockPrisma.payerContract.create.mockResolvedValue({ id: "contract_1" });
  mockPrisma.payerContract.findFirst.mockResolvedValue({ id: "contract_1" });
  mockPrisma.payerContract.update.mockResolvedValue({ id: "contract_1" });
  mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
});

describe("createContractAction", () => {
  it("creates a contract with parsed rate rows + audit log", async () => {
    const res = await createContractAction(
      fd({
        payerId: "60054",
        payerName: "Aetna",
        contractName: "Aetna Commercial 2026",
        effectiveStart: "2026-01-01",
        csv: GOOD_CSV,
      }),
    );

    expect(res.ok).toBe(true);
    const createArg = mockPrisma.payerContract.create.mock.calls[0][0];
    expect(createArg.data.payerId).toBe("60054");
    expect(createArg.data.rates.createMany.data).toHaveLength(3);
    // dollars → cents
    expect(createArg.data.rates.createMany.data[0]).toMatchObject({
      cptCode: "99213",
      modifier: null,
      allowedCents: 9250,
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "billing.contract.created" }) }),
    );
  });

  it("rejects when no valid rate rows parse", async () => {
    const res = await createContractAction(
      fd({
        payerId: "60054",
        payerName: "Aetna",
        contractName: "Empty",
        effectiveStart: "2026-01-01",
        csv: "not,a,valid\n,,",
      }),
    );
    expect(res.ok).toBe(false);
    expect(mockPrisma.payerContract.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate (payer, effective-start) contract", async () => {
    mockPrisma.payerContract.findUnique.mockResolvedValue({ id: "existing" });
    const res = await createContractAction(
      fd({
        payerId: "60054",
        payerName: "Aetna",
        contractName: "Dup",
        effectiveStart: "2026-01-01",
        csv: GOOD_CSV,
      }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error).toContain("already exists");
    expect(mockPrisma.payerContract.create).not.toHaveBeenCalled();
  });

  it("rejects an end date before the start date", async () => {
    const res = await createContractAction(
      fd({
        payerId: "60054",
        payerName: "Aetna",
        contractName: "Backwards",
        effectiveStart: "2026-06-01",
        effectiveEnd: "2026-01-01",
        csv: GOOD_CSV,
      }),
    );
    expect(res.ok).toBe(false);
    expect(mockPrisma.payerContract.create).not.toHaveBeenCalled();
  });
});

describe("setContractActiveAction", () => {
  it("deactivates an org-scoped contract and audits it", async () => {
    const res = await setContractActiveAction(fd({ contractId: "contract_1", active: "false" }));
    expect(res.ok).toBe(true);
    expect(mockPrisma.payerContract.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "billing.contract.deactivated" }) }),
    );
  });

  it("refuses to toggle a contract outside the caller's org", async () => {
    mockPrisma.payerContract.findFirst.mockResolvedValue(null);
    const res = await setContractActiveAction(fd({ contractId: "other_org", active: "true" }));
    expect(res.ok).toBe(false);
    expect(mockPrisma.payerContract.update).not.toHaveBeenCalled();
  });
});
