import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.mock` is hoisted above imports, so the mock fns it references must be
// created with `vi.hoisted` (not plain `const`, which initializes too late).
const { create, aggregate } = vi.hoisted(() => ({
  create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({})),
  aggregate: vi.fn(
    async (_args: { where: { createdAt?: { gte?: Date } } }) => ({
      _sum: { tokensIn: 100, tokensOut: 50 },
    }),
  ),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { llmUsage: { create, aggregate } },
}));
vi.mock("@/lib/observability/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

import {
  persistLlmUsage,
  sumTokensMTD,
  sumTokensSince,
  llmUsageAvailable,
} from "./usage-repository";

beforeEach(() => {
  create.mockClear();
  aggregate.mockClear();
});

describe("usage-repository", () => {
  it("persistLlmUsage writes a row with errorCode normalized to null", async () => {
    await persistLlmUsage({
      organizationId: "org1",
      agentBucket: "charting",
      agentName: "scribe",
      model: "m",
      tokensIn: 10,
      tokensOut: 5,
      latencyMs: 100,
      ok: true,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      organizationId: "org1",
      tokensIn: 10,
      tokensOut: 5,
      errorCode: null,
    });
  });

  it("sumTokensSince returns tokensIn + tokensOut", async () => {
    const total = await sumTokensSince("org1", new Date(0));
    expect(total).toBe(150);
    expect(aggregate).toHaveBeenCalledTimes(1);
  });

  it("sumTokensMTD aggregates from the start of the month", async () => {
    const total = await sumTokensMTD("org1");
    expect(total).toBe(150);
    expect(aggregate.mock.calls[0][0].where.createdAt?.gte).toBeInstanceOf(Date);
  });

  it("llmUsageAvailable is true when the delegate is present", () => {
    expect(llmUsageAvailable()).toBe(true);
  });
});
