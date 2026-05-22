// Unit tests for the bootstrap-audit helpers + the once-per-process
// audit runner. Mocks @prisma/client at the module level (so the import
// of @prisma/client in `bootstrap-audit.ts` for the Role type doesn't
// require generated client output) and stubs the audit + prisma layers.

import { vi } from "vitest";
vi.mock("server-only", () => ({}));

vi.mock("@prisma/client", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    bootstrapAllowlistSnapshot: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/observability/log", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    with: vi.fn().mockReturnThis(),
  },
}));

vi.mock("./audit-stub", () => ({
  logControllerAction: vi.fn().mockResolvedValue(undefined),
}));

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import {
  __resetBootstrapAllowlistAuditForTests,
  diffAllowlists,
  hashAllowlist,
  normaliseAllowlist,
  runBootstrapAllowlistAudit,
} from "./bootstrap-audit";
import { logControllerAction } from "./audit-stub";

const mockedFindFirst = vi.mocked(
  (prisma as unknown as {
    bootstrapAllowlistSnapshot: { findFirst: ReturnType<typeof vi.fn> };
  }).bootstrapAllowlistSnapshot.findFirst,
);
const mockedCreate = vi.mocked(
  (prisma as unknown as {
    bootstrapAllowlistSnapshot: { create: ReturnType<typeof vi.fn> };
  }).bootstrapAllowlistSnapshot.create,
);
const mockedLogControllerAction = vi.mocked(logControllerAction);
const mockedLoggerError = vi.mocked(logger.error);
const mockedLoggerInfo = vi.mocked(logger.info);

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
  __resetBootstrapAllowlistAuditForTests();
  // Reset env to a known baseline so individual tests can set just the
  // var they care about.
  process.env = { ...ORIGINAL_ENV };
  delete process.env.SUPER_ADMIN_BOOTSTRAP_EMAILS;
  delete process.env.RENDER_GIT_COMMIT;
  delete process.env.GIT_SHA;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("normaliseAllowlist", () => {
  it("lowercases, trims, and sorts emails", () => {
    const result = normaliseAllowlist(
      "  Bob@Example.com, alice@example.com,  charlie@example.com  ",
    );
    expect(result).toEqual([
      "alice@example.com",
      "bob@example.com",
      "charlie@example.com",
    ]);
  });

  it("dedupes case- and whitespace-collapsed addresses", () => {
    const result = normaliseAllowlist("a@b.com, A@B.COM ,  a@b.com");
    expect(result).toEqual(["a@b.com"]);
  });

  it("ignores empty and whitespace-only entries", () => {
    expect(normaliseAllowlist(",, , a@b.com ,,")).toEqual(["a@b.com"]);
  });

  it("returns an empty array for null/undefined/empty input", () => {
    expect(normaliseAllowlist(undefined)).toEqual([]);
    expect(normaliseAllowlist(null)).toEqual([]);
    expect(normaliseAllowlist("")).toEqual([]);
  });

  it("produces the same hash regardless of input order or casing", () => {
    const a = normaliseAllowlist("alice@x.com, BOB@x.com");
    const b = normaliseAllowlist("bob@x.com, Alice@X.COM");
    expect(hashAllowlist(a)).toEqual(hashAllowlist(b));
  });

  it("produces different hashes when the membership changes", () => {
    const a = normaliseAllowlist("alice@x.com");
    const b = normaliseAllowlist("alice@x.com, bob@x.com");
    expect(hashAllowlist(a)).not.toEqual(hashAllowlist(b));
  });
});

describe("diffAllowlists", () => {
  it("reports added and removed sets disjointly", () => {
    const result = diffAllowlists(
      ["alice@x.com", "bob@x.com"],
      ["bob@x.com", "carol@x.com"],
    );
    expect(result.added).toEqual(["carol@x.com"]);
    expect(result.removed).toEqual(["alice@x.com"]);
  });

  it("returns empty arrays when the lists are identical", () => {
    const result = diffAllowlists(["a@x.com"], ["a@x.com"]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it("sorts diff output for stable audit payloads", () => {
    const result = diffAllowlists([], ["zach@x.com", "alice@x.com"]);
    expect(result.added).toEqual(["alice@x.com", "zach@x.com"]);
  });
});

describe("runBootstrapAllowlistAudit — first boot", () => {
  it("inserts a baseline snapshot and emits the 'initialised' event without alarming", async () => {
    process.env.SUPER_ADMIN_BOOTSTRAP_EMAILS = "alice@x.com";
    mockedFindFirst.mockResolvedValue(null);
    mockedCreate.mockResolvedValue({});

    await runBootstrapAllowlistAudit();

    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(mockedLogControllerAction).toHaveBeenCalledTimes(1);
    const entry = mockedLogControllerAction.mock.calls[0]![0];
    expect(entry.action).toBe(
      "super_admin.bootstrap_allowlist_initialised",
    );
    // Baseline should not trigger the error-level alarm.
    expect(mockedLoggerError).not.toHaveBeenCalled();
    expect(mockedLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "super_admin.bootstrap_allowlist_initialised",
      }),
    );
  });
});

describe("runBootstrapAllowlistAudit — change detection", () => {
  it("emits change event with diff when the allowlist rotates", async () => {
    process.env.SUPER_ADMIN_BOOTSTRAP_EMAILS = "alice@x.com, carol@x.com";
    process.env.RENDER_GIT_COMMIT = "deadbeef";
    mockedFindFirst.mockResolvedValue({
      hash: hashAllowlist(["alice@x.com", "bob@x.com"]),
      emails: ["alice@x.com", "bob@x.com"],
    });
    mockedCreate.mockResolvedValue({});

    await runBootstrapAllowlistAudit();

    expect(mockedCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        emails: ["alice@x.com", "carol@x.com"],
        deploySha: "deadbeef",
      }),
    });
    const entry = mockedLogControllerAction.mock.calls[0]![0];
    expect(entry.action).toBe("super_admin.bootstrap_allowlist_changed");
    expect(mockedLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "super_admin.bootstrap_allowlist_changed",
        added: ["carol@x.com"],
        removed: ["bob@x.com"],
        deploySha: "deadbeef",
      }),
    );
  });

  it("is idempotent — no insert when the hash matches the most recent snapshot", async () => {
    process.env.SUPER_ADMIN_BOOTSTRAP_EMAILS = "alice@x.com";
    mockedFindFirst.mockResolvedValue({
      hash: hashAllowlist(["alice@x.com"]),
      emails: ["alice@x.com"],
    });

    await runBootstrapAllowlistAudit();

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedLogControllerAction).not.toHaveBeenCalled();
    expect(mockedLoggerError).not.toHaveBeenCalled();
  });

  it("only runs once per process (memoised)", async () => {
    process.env.SUPER_ADMIN_BOOTSTRAP_EMAILS = "alice@x.com";
    mockedFindFirst.mockResolvedValue({
      hash: hashAllowlist(["alice@x.com"]),
      emails: ["alice@x.com"],
    });

    await runBootstrapAllowlistAudit();
    await runBootstrapAllowlistAudit();
    await runBootstrapAllowlistAudit();

    expect(mockedFindFirst).toHaveBeenCalledTimes(1);
  });
});
