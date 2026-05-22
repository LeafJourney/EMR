// EMR-727 — session-kill-list contract tests.
//
// Why unit-level instead of an HTTP/Postgres smoke test?
//   The two properties we actually need to defend are
//     (a) the in-process cache honours its TTL (so a kill propagates
//         within ≤1s without re-reading on every request), and
//     (b) the cache invalidation on `kill()` is wired up so the
//         same-replica next request is immediate.
//   Both are functions over (cache state, prisma return value); driving
//   them via mocked prisma + a fake clock gives a deterministic check at
//   millisecond resolution that an integration test couldn't.

import { vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sessionKillList: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  isUserRevoked,
  kill,
  clearKill,
  _clearCacheForTests,
  invalidateLocalCache,
  KILL_LIST_TTL_MS,
} from "./session-kill-list";

const mockedFindUnique = vi.mocked(prisma.sessionKillList.findUnique);
const mockedUpsert = vi.mocked(prisma.sessionKillList.upsert);
const mockedDeleteMany = vi.mocked(prisma.sessionKillList.deleteMany);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-17T12:00:00.000Z"));
  _clearCacheForTests();
  vi.clearAllMocks();
  // Default: prisma sees no row.
  mockedFindUnique.mockResolvedValue(null);
  mockedUpsert.mockResolvedValue({} as never);
  mockedDeleteMany.mockResolvedValue({ count: 0 } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isUserRevoked", () => {
  it("returns false when no kill-list row exists", async () => {
    await expect(isUserRevoked("user_a")).resolves.toBe(false);
    expect(mockedFindUnique).toHaveBeenCalledTimes(1);
  });

  it("returns true when an unexpired row exists", async () => {
    mockedFindUnique.mockResolvedValueOnce({
      expiresAt: new Date("2026-08-17T12:00:00.000Z"),
    } as never);
    await expect(isUserRevoked("user_a")).resolves.toBe(true);
  });

  it("returns false when an expired row exists (tombstone, no lockout)", async () => {
    mockedFindUnique.mockResolvedValueOnce({
      expiresAt: new Date("2026-05-17T11:59:00.000Z"),
    } as never);
    await expect(isUserRevoked("user_a")).resolves.toBe(false);
  });

  it("hits the cache on the second call within the TTL window", async () => {
    await isUserRevoked("user_a");
    await isUserRevoked("user_a");
    await isUserRevoked("user_a");
    expect(mockedFindUnique).toHaveBeenCalledTimes(1);
  });

  it("re-reads after the cache TTL elapses (≤1s propagation bound)", async () => {
    await isUserRevoked("user_a");
    vi.advanceTimersByTime(1_001);
    await isUserRevoked("user_a");
    expect(mockedFindUnique).toHaveBeenCalledTimes(2);
  });

  it("caches the negative verdict separately per user", async () => {
    await isUserRevoked("user_a");
    await isUserRevoked("user_b");
    expect(mockedFindUnique).toHaveBeenCalledTimes(2);
  });

  it("returns false for empty userId without touching prisma", async () => {
    await expect(isUserRevoked("")).resolves.toBe(false);
    expect(mockedFindUnique).not.toHaveBeenCalled();
  });
});

describe("kill", () => {
  it("upserts with the configured TTL and invalidates the local cache", async () => {
    // Prime cache to "not revoked"
    await isUserRevoked("user_a");
    expect(mockedFindUnique).toHaveBeenCalledTimes(1);

    await kill({ userId: "user_a", reason: "compromised", revokedById: "admin_1" });

    expect(mockedUpsert).toHaveBeenCalledTimes(1);
    const call = mockedUpsert.mock.calls[0][0]!;
    expect(call.where).toEqual({ userId: "user_a" });
    expect(call.create.reason).toBe("compromised");
    expect(call.create.revokedById).toBe("admin_1");
    const expiresAtMs = (call.create.expiresAt as Date).getTime();
    expect(expiresAtMs - Date.now()).toBe(KILL_LIST_TTL_MS);

    // Cache invalidated → next read re-hits prisma
    mockedFindUnique.mockResolvedValueOnce({
      expiresAt: new Date(Date.now() + KILL_LIST_TTL_MS),
    } as never);
    await expect(isUserRevoked("user_a")).resolves.toBe(true);
    expect(mockedFindUnique).toHaveBeenCalledTimes(2);
  });

  it("respects an explicit ttlMs override", async () => {
    await kill({
      userId: "user_a",
      reason: "test",
      revokedById: "admin_1",
      ttlMs: 60_000,
    });
    const call = mockedUpsert.mock.calls[0][0]!;
    const expiresAtMs = (call.create.expiresAt as Date).getTime();
    expect(expiresAtMs - Date.now()).toBe(60_000);
  });
});

describe("clearKill", () => {
  it("deletes the row and invalidates the cache", async () => {
    // Cache "revoked" verdict
    mockedFindUnique.mockResolvedValueOnce({
      expiresAt: new Date(Date.now() + 1_000_000),
    } as never);
    await expect(isUserRevoked("user_a")).resolves.toBe(true);

    await clearKill("user_a");
    expect(mockedDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_a" } });

    // Next read re-hits prisma; row is now gone → false
    mockedFindUnique.mockResolvedValueOnce(null);
    await expect(isUserRevoked("user_a")).resolves.toBe(false);
  });
});

describe("invalidateLocalCache", () => {
  it("drops a cached verdict without writing", async () => {
    await isUserRevoked("user_a");
    invalidateLocalCache("user_a");
    await isUserRevoked("user_a");
    expect(mockedFindUnique).toHaveBeenCalledTimes(2);
    expect(mockedUpsert).not.toHaveBeenCalled();
    expect(mockedDeleteMany).not.toHaveBeenCalled();
  });
});
