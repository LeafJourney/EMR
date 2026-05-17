// EMR-734 — Framework unit tests.
//
// Strategy: a tiny in-memory fake of `prisma.anomaly` that implements
// just enough of the surface `applyEmissions` uses (findUnique, create,
// update, updateMany). This is cheaper than vi.mock-per-call and lets
// us test the real upsert / auto-resolve / TTL semantics end-to-end.

import { describe, it, expect, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  applyEmissions,
  registerDetector,
  getRegisteredDetectors,
  __resetRegistryForTests,
  type AnomalyEmission,
} from "./framework";

// ── In-memory fake prisma.anomaly ──────────────────────────

type FakeAnomalyRow = {
  id: string;
  slug: string;
  kind: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  practiceId: string | null;
  message: string;
  deeplinkUrl: string;
  context: unknown;
  idempotencyKey: string;
  ttlSeconds: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  resolvedAt: Date | null;
};

function makeFakePrisma() {
  const rows: FakeAnomalyRow[] = [];
  let idSeq = 0;

  const matches = (row: FakeAnomalyRow, where: any): boolean => {
    if (where.kind !== undefined && row.kind !== where.kind) return false;
    if (where.resolvedAt !== undefined) {
      if (where.resolvedAt === null && row.resolvedAt !== null) return false;
    }
    if (where.idempotencyKey?.notIn) {
      if (where.idempotencyKey.notIn.includes(row.idempotencyKey)) return false;
    }
    if (where.expiresAt?.gte && row.expiresAt < where.expiresAt.gte) return false;
    if (where.expiresAt?.lt && row.expiresAt >= where.expiresAt.lt) return false;
    return true;
  };

  const anomaly = {
    findUnique: async ({ where }: any): Promise<FakeAnomalyRow | null> => {
      if (where.kind_idempotencyKey) {
        const { kind, idempotencyKey } = where.kind_idempotencyKey;
        return (
          rows.find((r) => r.kind === kind && r.idempotencyKey === idempotencyKey) ??
          null
        );
      }
      return null;
    },
    create: async ({ data }: any): Promise<FakeAnomalyRow> => {
      const row: FakeAnomalyRow = {
        id: `anom_${++idSeq}`,
        slug: data.slug,
        kind: data.kind,
        severity: data.severity,
        practiceId: data.practiceId ?? null,
        message: data.message,
        deeplinkUrl: data.deeplinkUrl,
        context: data.context,
        idempotencyKey: data.idempotencyKey,
        ttlSeconds: data.ttlSeconds,
        firstSeenAt: data.firstSeenAt ?? new Date(),
        lastSeenAt: data.lastSeenAt ?? new Date(),
        expiresAt: data.expiresAt,
        resolvedAt: null,
      };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: any): Promise<FakeAnomalyRow> => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error(`fake prisma: no row with id ${where.id}`);
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: any): Promise<{ count: number }> => {
      let count = 0;
      for (const row of rows) {
        if (matches(row, where)) {
          Object.assign(row, data);
          count++;
        }
      }
      return { count };
    },
    // Test introspection helpers (not on real prisma).
    __rows: rows,
  };

  return { anomaly, __rows: rows } as unknown as PrismaClient & {
    __rows: FakeAnomalyRow[];
  };
}

// ── Helpers ────────────────────────────────────────────────

function emission(over: Partial<AnomalyEmission> = {}): AnomalyEmission {
  return {
    slug: over.slug ?? "stuck-publish-cfg-abc",
    idempotencyKey: over.idempotencyKey ?? "configId=cfg_abc",
    severity: over.severity ?? "warning",
    practiceId: over.practiceId === undefined ? null : over.practiceId,
    message: over.message ?? "Publish stuck >10m",
    deeplinkUrl: over.deeplinkUrl ?? "/super-admin/practices/p1/configs/cfg_abc",
    context: over.context ?? { configId: "cfg_abc" },
    ttlSeconds: over.ttlSeconds ?? 3600,
  };
}

// ── Tests ──────────────────────────────────────────────────

describe("anomaly framework — applyEmissions", () => {
  let prisma: ReturnType<typeof makeFakePrisma>;

  beforeEach(() => {
    prisma = makeFakePrisma();
  });

  it("inserts a new row on first emission", async () => {
    const now = new Date("2026-05-17T12:00:00Z");
    const result = await applyEmissions(prisma, "stuck_publish", [emission()], now);
    expect(result.newOpened).toBe(1);
    expect(result.reaffirmed).toBe(0);
    expect(result.autoResolved).toBe(0);
    expect(result.ttlExpired).toBe(0);
    expect(prisma.__rows).toHaveLength(1);
    expect(prisma.__rows[0].kind).toBe("stuck_publish");
    expect(prisma.__rows[0].expiresAt.getTime()).toBe(
      now.getTime() + 3600 * 1000,
    );
  });

  it("upserts on duplicate idempotencyKey — single row, bumped lastSeenAt", async () => {
    const t1 = new Date("2026-05-17T12:00:00Z");
    await applyEmissions(prisma, "stuck_publish", [emission()], t1);

    const t2 = new Date("2026-05-17T12:10:00Z");
    const result = await applyEmissions(
      prisma,
      "stuck_publish",
      [emission()],
      t2,
    );

    expect(prisma.__rows).toHaveLength(1);
    expect(result.newOpened).toBe(0);
    expect(result.reaffirmed).toBe(1);
    expect(prisma.__rows[0].lastSeenAt.getTime()).toBe(t2.getTime());
    expect(prisma.__rows[0].expiresAt.getTime()).toBe(t2.getTime() + 3600_000);
    expect(prisma.__rows[0].resolvedAt).toBeNull();
  });

  it("auto-resolves when detector stops emitting a previously-emitted key", async () => {
    const t1 = new Date("2026-05-17T12:00:00Z");
    await applyEmissions(prisma, "stuck_publish", [emission()], t1);

    // TTL is 1h, so on a 10-minute-later sweep the row is still live.
    // Detector now emits nothing → row should auto-resolve.
    const t2 = new Date("2026-05-17T12:10:00Z");
    const result = await applyEmissions(prisma, "stuck_publish", [], t2);

    expect(result.autoResolved).toBe(1);
    expect(result.ttlExpired).toBe(0);
    expect(prisma.__rows).toHaveLength(1);
    expect(prisma.__rows[0].resolvedAt?.getTime()).toBe(t2.getTime());
  });

  it("TTL-expires a stale live row even if detector emits nothing", async () => {
    // Plant a row whose expiresAt is in the past — simulates a detector
    // that emitted once and then went silent (bug, deploy, etc.).
    const t1 = new Date("2026-05-17T12:00:00Z");
    await applyEmissions(
      prisma,
      "stuck_publish",
      [emission({ ttlSeconds: 60 })], // 1-minute TTL
      t1,
    );

    // Two hours later, no emissions. The row should be TTL-expired, not
    // double-counted as auto-resolved.
    const t2 = new Date("2026-05-17T14:00:00Z");
    const result = await applyEmissions(prisma, "stuck_publish", [], t2);

    expect(result.autoResolved).toBe(0);
    expect(result.ttlExpired).toBe(1);
    expect(prisma.__rows[0].resolvedAt?.getTime()).toBe(t2.getTime());
  });

  it("cross-detector isolation — detector A does not resolve detector B's rows", async () => {
    const t1 = new Date("2026-05-17T12:00:00Z");
    // Open one anomaly under each detector.
    await applyEmissions(
      prisma,
      "stuck_publish",
      [emission({ idempotencyKey: "A", slug: "a" })],
      t1,
    );
    await applyEmissions(
      prisma,
      "webhook_health",
      [emission({ idempotencyKey: "B", slug: "b" })],
      t1,
    );
    expect(prisma.__rows).toHaveLength(2);

    // Detector A emits nothing — it should resolve its own row, but
    // leave detector B's row alone.
    const t2 = new Date("2026-05-17T12:10:00Z");
    const result = await applyEmissions(prisma, "stuck_publish", [], t2);

    expect(result.autoResolved).toBe(1);

    const aRow = prisma.__rows.find((r) => r.kind === "stuck_publish");
    const bRow = prisma.__rows.find((r) => r.kind === "webhook_health");
    expect(aRow?.resolvedAt).not.toBeNull();
    expect(bRow?.resolvedAt).toBeNull();
  });

  it("supports null practiceId (fleet-wide anomalies)", async () => {
    const t1 = new Date("2026-05-17T12:00:00Z");
    await applyEmissions(
      prisma,
      "platform_health",
      [emission({ practiceId: null, idempotencyKey: "fleet" })],
      t1,
    );
    expect(prisma.__rows[0].practiceId).toBeNull();
  });

  it("re-opens a previously-resolved key when the detector starts re-emitting", async () => {
    const t1 = new Date("2026-05-17T12:00:00Z");
    await applyEmissions(prisma, "stuck_publish", [emission()], t1);

    // Resolve it.
    const t2 = new Date("2026-05-17T12:10:00Z");
    await applyEmissions(prisma, "stuck_publish", [], t2);
    expect(prisma.__rows[0].resolvedAt).not.toBeNull();

    // Detector flaps and re-emits — row should come back live.
    const t3 = new Date("2026-05-17T12:20:00Z");
    const result = await applyEmissions(
      prisma,
      "stuck_publish",
      [emission()],
      t3,
    );
    expect(result.reaffirmed).toBe(1);
    expect(prisma.__rows[0].resolvedAt).toBeNull();
    expect(prisma.__rows[0].lastSeenAt.getTime()).toBe(t3.getTime());
  });
});

describe("anomaly framework — registry", () => {
  beforeEach(() => {
    __resetRegistryForTests();
  });

  it("starts empty", () => {
    expect(getRegisteredDetectors()).toHaveLength(0);
  });

  it("registers detectors in order", () => {
    registerDetector({ slug: "a", run: async () => [] });
    registerDetector({ slug: "b", run: async () => [] });
    expect(getRegisteredDetectors().map((d) => d.slug)).toEqual(["a", "b"]);
  });

  it("rejects duplicate slugs", () => {
    registerDetector({ slug: "a", run: async () => [] });
    expect(() =>
      registerDetector({ slug: "a", run: async () => [] }),
    ).toThrow(/already registered/);
  });
});
