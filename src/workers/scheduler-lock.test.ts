import { describe, it, expect, vi, beforeEach } from "vitest";
import { pollClearinghouseGateway } from "./scheduler";
import { prisma } from "../lib/db/prisma";
import { getDefaultAdapter } from "../lib/billing/clearinghouse/gateway";

vi.mock("../lib/db/prisma", () => {
  const mockPrisma = {
    organization: {
      findFirst: vi.fn(),
    },
    billingMemory: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
  return { prisma: mockPrisma };
});

vi.mock("../lib/billing/clearinghouse/gateway", () => {
  const mockAdapter = {
    name: "MockAdapter",
    poll: vi.fn(),
  };
  return {
    getDefaultAdapter: vi.fn(() => mockAdapter),
  };
});

describe("Scheduler Advisory Lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should acquire advisory lock 1217 and execute polling logic when lock is available", async () => {
    const mockAdapter = getDefaultAdapter();
    vi.mocked(mockAdapter.poll).mockResolvedValue({ documents: [], nextCursor: null });

    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "org-1" } as any);
    vi.mocked(prisma.billingMemory.findFirst).mockResolvedValue(null);

    // Mock $transaction to run the callback
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback(prisma);
    });

    // Mock queryRaw to return locked: true
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ locked: true }] as any);

    await pollClearinghouseGateway();

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("pg_try_advisory_xact_lock(1217)")]),
    );
    expect(mockAdapter.poll).toHaveBeenCalled();
  });

  it("should skip polling logic when advisory lock is already held", async () => {
    const mockAdapter = getDefaultAdapter();
    vi.mocked(mockAdapter.poll).mockResolvedValue({ documents: [], nextCursor: null });

    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "org-1" } as any);

    // Mock $transaction to run the callback
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback(prisma);
    });

    // Mock queryRaw to return locked: false
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ locked: false }] as any);

    await pollClearinghouseGateway();

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("pg_try_advisory_xact_lock(1217)")]),
    );
    // Polling logic must be skipped
    expect(mockAdapter.poll).not.toHaveBeenCalled();
  });
});
