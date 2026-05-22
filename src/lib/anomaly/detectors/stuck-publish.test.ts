// EMR-737 — stuck-publish detector tests.
//
// Strategy: fake `prisma.practiceConfiguration.findMany` that returns
// fixture rows. The detector is a pure projection over Prisma state, so
// the tests just verify the projection (threshold, idempotency key,
// severity, deeplink).

import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { stuckPublishDetector } from "./stuck-publish";

type ConfigRow = {
  id: string;
  organizationId: string;
  practiceId: string;
  status: string;
  updatedAt: Date;
};

function fakePrisma(rows: ConfigRow[]): PrismaClient {
  return {
    practiceConfiguration: {
      findMany: async ({ where }: any) => {
        return rows.filter((r) => {
          if (where?.status?.in && !where.status.in.includes(r.status)) {
            return false;
          }
          if (where?.updatedAt?.lt && !(r.updatedAt < where.updatedAt.lt)) {
            return false;
          }
          return true;
        });
      },
    },
  } as unknown as PrismaClient;
}

describe("stuck-publish detector", () => {
  it("emits for a draft config older than 24h", async () => {
    const prisma = fakePrisma([
      {
        id: "cfg_abc",
        organizationId: "org_1",
        practiceId: "prac_1",
        status: "draft",
        updatedAt: new Date(Date.now() - 30 * 60 * 60 * 1000), // 30h ago
      },
    ]);
    const emissions = await stuckPublishDetector.run(prisma);
    expect(emissions).toHaveLength(1);
    const e = emissions[0];
    expect(e.severity).toBe("warning");
    expect(e.practiceId).toBe("prac_1");
    expect(e.deeplinkUrl).toBe("/admin/practices/org_1");
    expect((e.context as Record<string, unknown>).configId).toBe("cfg_abc");
    expect((e.context as Record<string, unknown>).status).toBe("draft");
    expect((e.context as Record<string, unknown>).hoursStuck).toBeGreaterThanOrEqual(30);
  });

  it("emits nothing when no drafts are stuck", async () => {
    const prisma = fakePrisma([
      {
        id: "cfg_recent",
        organizationId: "org_1",
        practiceId: "prac_1",
        status: "draft",
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
      },
      {
        id: "cfg_published",
        organizationId: "org_2",
        practiceId: "prac_2",
        status: "published",
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // ancient
      },
    ]);
    const emissions = await stuckPublishDetector.run(prisma);
    expect(emissions).toEqual([]);
  });

  it("idempotency key is deterministic for the same input (day bucket)", async () => {
    const updatedAt = new Date("2026-05-15T03:00:00Z");
    const row: ConfigRow = {
      id: "cfg_x",
      organizationId: "org_x",
      practiceId: "prac_x",
      status: "draft",
      updatedAt,
    };
    const prisma = fakePrisma([row]);
    const a = await stuckPublishDetector.run(prisma);
    const b = await stuckPublishDetector.run(prisma);
    expect(a[0].idempotencyKey).toBe(b[0].idempotencyKey);
    expect(a[0].idempotencyKey).toBe("stuck_publish:cfg_x:2026-05-15");
  });
});
