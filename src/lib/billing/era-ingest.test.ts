import { beforeEach, describe, expect, it, vi } from "vitest";

// EMR-221 — ingestEra persistence behavior, with Prisma mocked (vi.hoisted
// pattern). Exercises the paths the pure parser tests can't reach: claim
// matching, reversal posting, and the safety fix that refuses to blind-match
// a payment to an arbitrary claim.

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    eraFile: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    claim: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    adjudicationResult: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    financialEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { mockPrisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));

const { mockPrisma } = hoisted;

import { ingestEra } from "./era-ingest";

const MINIMAL_835 = [
  "ISA*00*          *00*          *ZZ*PAYER          *ZZ*PROVIDER       *060309*0900*U*00401*000000001*0*P*:~",
  "GS*HP*PAYER*PROVIDER*20060309*0900*1*X*004010X091A1~",
  "ST*835*1234~",
  "BPR*I*150.00*C*ACH*CTX*01*999999992*DA*123456*1234567890**01*999988880*DA*98765*20060310~",
  "TRN*1*EFT12345*1234567890~",
  "DTM*405*20060310~",
  "N1*PR*BLUE CROSS BLUE SHIELD~",
  "N1*PE*LEAFJOURNEY HEALTH*XX*1234567890~",
  "CLP*CLM-001*1*200.00*150.00*40.00*12*PCN-001~",
  "SVC*HC:99214*100.00*80.00**1~",
  "CAS*CO*45*20.00~",
  "CAS*PR*1*20.00~",
  "SVC*HC:36415*100.00*70.00**1~",
  "CAS*CO*45*10.00~",
  "CAS*PR*2*20.00~",
  "PLB*1234567890*20061231*WO:ckno1234*-25.00~",
  "SE*16*1234~",
  "GE*1*1~",
  "IEA*1*000000001~",
].join("");

const REVERSAL_835 = MINIMAL_835.replace("CLP*CLM-001*1*", "CLP*CLM-001*22*");

beforeEach(() => {
  vi.clearAllMocks();
  // Not a duplicate by content hash or check number.
  mockPrisma.eraFile.findUnique.mockResolvedValue(null);
  mockPrisma.eraFile.create.mockResolvedValue({ id: "era_1" });
  mockPrisma.eraFile.update.mockResolvedValue({ id: "era_1" });
  mockPrisma.adjudicationResult.create.mockResolvedValue({ id: "adj_1" });
  mockPrisma.financialEvent.create.mockResolvedValue({ id: "fe_1" });
  mockPrisma.claim.update.mockResolvedValue({ id: "claim_internal" });
  // The transaction callback runs against the same mock object.
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma));
});

describe("ingestEra — matched claim posting", () => {
  it("posts a payment and PLB when the control number matches a claim", async () => {
    mockPrisma.claim.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.claimNumber === "CLM-001" ? { id: "claim_internal" } : null,
    );

    const outcome = await ingestEra({
      organizationId: "org_1",
      rawPayload: MINIMAL_835,
      source: "test_fixture",
    });

    expect(outcome.kind).toBe("ingested");
    if (outcome.kind !== "ingested") throw new Error("expected ingested");
    expect(outcome.claimsAdjudicated).toBe(1);
    expect(outcome.claimsUnmatched).toBe(0);
    expect(outcome.plbAdjustmentsCount).toBe(1);

    expect(mockPrisma.adjudicationResult.create).toHaveBeenCalledTimes(1);
    // Positive payment increments the claim's paid total.
    const updateArg = mockPrisma.claim.update.mock.calls[0][0];
    expect(updateArg.data.paidAmountCents).toEqual({ increment: 15000 });
    // ERA file is marked posted at the end of the transaction.
    expect(mockPrisma.eraFile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "posted" }) }),
    );
  });
});

describe("ingestEra — reversal posting", () => {
  it("decrements the paid total on a takeback (CLP status 22)", async () => {
    mockPrisma.claim.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.claimNumber === "CLM-001" ? { id: "claim_internal" } : null,
    );

    await ingestEra({ organizationId: "org_1", rawPayload: REVERSAL_835, source: "test_fixture" });

    const updateArg = mockPrisma.claim.update.mock.calls[0][0];
    expect(updateArg.data.paidAmountCents.increment).toBeLessThan(0);
  });
});

describe("ingestEra — unmatched-claim safety (resolveClaim fix)", () => {
  it("leaves the claim unmatched rather than blind-matching an arbitrary adjudication row", async () => {
    // No claim matches by id or claim number.
    mockPrisma.claim.findFirst.mockResolvedValue(null);

    const outcome = await ingestEra({
      organizationId: "org_1",
      rawPayload: MINIMAL_835,
      source: "test_fixture",
    });

    expect(outcome.kind).toBe("ingested");
    if (outcome.kind !== "ingested") throw new Error("expected ingested");
    expect(outcome.claimsAdjudicated).toBe(0);
    expect(outcome.claimsUnmatched).toBe(1);

    // No adjudication row is created for an unmatched claim...
    expect(mockPrisma.adjudicationResult.create).not.toHaveBeenCalled();
    // ...and the dangerous blind-match query is never issued.
    expect(mockPrisma.adjudicationResult.findFirst).not.toHaveBeenCalled();
    // PLB is still posted; the file still completes.
    expect(mockPrisma.financialEvent.create).toHaveBeenCalledTimes(1);
  });

  it("returns a duplicate outcome when the content hash already exists", async () => {
    mockPrisma.eraFile.findUnique.mockResolvedValueOnce({ id: "era_existing" });

    const outcome = await ingestEra({
      organizationId: "org_1",
      rawPayload: MINIMAL_835,
      source: "test_fixture",
    });

    expect(outcome.kind).toBe("duplicate");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
