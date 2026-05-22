// EMR-737 — billing-drop detector tests.
//
// Fake `prisma.claim.groupBy` returns hand-rolled aggregates for the two
// 7-day windows. Tests exercise the WARNING / CRITICAL thresholds and
// the "skip when prior week is zero" guard.

import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { billingDropDetector } from "./billing-drop";

type Aggregate = { organizationId: string; _sum: { billedAmountCents: number | null } };

function fakePrisma(opts: {
  recent: Aggregate[];
  prior: Aggregate[];
}): PrismaClient {
  let call = 0;
  return {
    claim: {
      groupBy: async () => {
        const out = call === 0 ? opts.recent : opts.prior;
        call++;
        return out;
      },
    },
  } as unknown as PrismaClient;
}

describe("billing-drop detector", () => {
  it("emits WARNING at ≥30% drop and CRITICAL at ≥60% drop", async () => {
    const prisma = fakePrisma({
      recent: [
        { organizationId: "org_warn", _sum: { billedAmountCents: 6500 } }, // -35%
        { organizationId: "org_crit", _sum: { billedAmountCents: 2500 } }, // -75%
        { organizationId: "org_ok", _sum: { billedAmountCents: 9500 } }, //  -5%
      ],
      prior: [
        { organizationId: "org_warn", _sum: { billedAmountCents: 10000 } },
        { organizationId: "org_crit", _sum: { billedAmountCents: 10000 } },
        { organizationId: "org_ok", _sum: { billedAmountCents: 10000 } },
      ],
    });
    const emissions = await billingDropDetector.run(prisma);
    expect(emissions).toHaveLength(2);
    const warn = emissions.find((e) => e.practiceId === "org_warn");
    const crit = emissions.find((e) => e.practiceId === "org_crit");
    expect(warn?.severity).toBe("warning");
    expect(crit?.severity).toBe("critical");
    expect((warn?.context as any).dropPct).toBeGreaterThanOrEqual(30);
    expect((crit?.context as any).dropPct).toBeGreaterThanOrEqual(60);
  });

  it("emits nothing when no organization has dropped enough", async () => {
    const prisma = fakePrisma({
      recent: [
        { organizationId: "org_a", _sum: { billedAmountCents: 9500 } },
        { organizationId: "org_b", _sum: { billedAmountCents: 12000 } },
      ],
      prior: [
        { organizationId: "org_a", _sum: { billedAmountCents: 10000 } },
        { organizationId: "org_b", _sum: { billedAmountCents: 10000 } },
      ],
    });
    const emissions = await billingDropDetector.run(prisma);
    expect(emissions).toEqual([]);
  });

  it("skips orgs with zero prior-week total (new practice guard)", async () => {
    const prisma = fakePrisma({
      recent: [
        { organizationId: "org_new", _sum: { billedAmountCents: 0 } },
      ],
      prior: [
        { organizationId: "org_new", _sum: { billedAmountCents: 0 } },
      ],
    });
    const emissions = await billingDropDetector.run(prisma);
    expect(emissions).toEqual([]);
  });

  it("idempotency key is deterministic for the same input (week bucket)", async () => {
    const data = {
      recent: [{ organizationId: "org_x", _sum: { billedAmountCents: 2000 } }],
      prior: [{ organizationId: "org_x", _sum: { billedAmountCents: 10000 } }],
    };
    const a = await billingDropDetector.run(fakePrisma(data));
    const b = await billingDropDetector.run(fakePrisma(data));
    expect(a[0].idempotencyKey).toBe(b[0].idempotencyKey);
    expect(a[0].idempotencyKey.startsWith("billing_drop:org_x:")).toBe(true);
  });
});
