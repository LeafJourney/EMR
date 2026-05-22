// EMR-737 — agent-failure detector tests.

import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { agentFailureDetector } from "./agent-failure";

type Group = { organizationId: string | null; _count: { _all: number } };

function fakePrisma(groups: Group[]): PrismaClient {
  return {
    controllerAuditLog: {
      groupBy: async () => groups,
    },
  } as unknown as PrismaClient;
}

describe("agent-failure detector", () => {
  it("emits CRITICAL when an org has >5 errors in the last hour", async () => {
    const prisma = fakePrisma([
      { organizationId: "org_bad", _count: { _all: 6 } },
      { organizationId: "org_worse", _count: { _all: 42 } },
    ]);
    const emissions = await agentFailureDetector.run(prisma);
    expect(emissions).toHaveLength(2);
    expect(emissions.every((e) => e.severity === "critical")).toBe(true);
    const bad = emissions.find((e) => e.practiceId === "org_bad");
    expect((bad?.context as any).errorCount).toBe(6);
  });

  it("emits nothing at or under the 5-error threshold", async () => {
    const prisma = fakePrisma([
      { organizationId: "org_ok", _count: { _all: 5 } },
      { organizationId: "org_quiet", _count: { _all: 1 } },
    ]);
    const emissions = await agentFailureDetector.run(prisma);
    expect(emissions).toEqual([]);
  });

  it("idempotency key is deterministic for the same input (hour bucket)", async () => {
    const data = [{ organizationId: "org_x", _count: { _all: 10 } }];
    const a = await agentFailureDetector.run(fakePrisma(data));
    const b = await agentFailureDetector.run(fakePrisma(data));
    expect(a[0].idempotencyKey).toBe(b[0].idempotencyKey);
    expect(a[0].idempotencyKey.startsWith("agent_failure:org_x:")).toBe(true);
  });
});
