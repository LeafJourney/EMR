// vi.mock for "server-only" must come before any module that imports it,
// otherwise the package's runtime guard throws during test collection
// (it refuses to load outside a server-component context).
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

// Unit tests for requireApiAuth — verifies the gate's response envelope
// for every (auth state × role × rate-limit) combination without
// standing up a server or hitting Clerk.
//
// Why unit-level instead of an HTTP smoke spec? The behaviour we
// actually care about — "does the helper return the right Response
// shape" — is a function from inputs to outputs. An HTTP test would
// require Clerk session forging, which is a separate harness problem;
// the unit shape gives us 95% of the guarantee at 5% of the setup
// cost.

import { describe, it, expect, beforeEach } from "vitest";

vi.mock("./session", () => ({
  requireUser: vi.fn(),
}));

vi.mock("./super-admin-bootstrap", () => ({
  bootstrapSuperAdminIfAllowlisted: vi.fn(),
}));

vi.mock("./session-kill-list", () => ({
  isUserRevoked: () => Promise.resolve(false),
}));

vi.mock("./super-admin-mfa", () => ({
  loadSuperAdminMfaState: () => Promise.resolve({ status: "enrolled" }),
  buildMfaRequiredResponse: () => new Response(null, { status: 403 }),
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

import { requireUser } from "./session";
import { bootstrapSuperAdminIfAllowlisted } from "./super-admin-bootstrap";
import { requireApiAuth } from "./api-gate";

const mockedRequireUser = vi.mocked(requireUser);
const mockedBootstrap = vi.mocked(bootstrapSuperAdminIfAllowlisted);

const baseUser = {
  id: "user_001",
  email: "alice@example.com",
  firstName: "Alice",
  lastName: "Example",
  roles: ["clinician" as const],
  organizationId: "org_001",
  organizationName: "Test Org",
};

beforeEach(() => {
  vi.resetAllMocks();
  mockedBootstrap.mockResolvedValue(false);
});

describe("requireApiAuth — authentication", () => {
  it("returns 401 when requireUser throws (unauthenticated)", async () => {
    mockedRequireUser.mockRejectedValue(new Error("UNAUTHORIZED"));
    const gate = await requireApiAuth();
    expect(gate.actor).toBeNull();
    expect(gate.error).not.toBeNull();
    expect(gate.error!.status).toBe(401);
    const body = await gate.error!.json();
    expect(body.error).toBe("UNAUTHORIZED");
  });

  it("returns the actor when authenticated and no role required", async () => {
    mockedRequireUser.mockResolvedValue(baseUser);
    const gate = await requireApiAuth();
    expect(gate.error).toBeNull();
    expect(gate.actor).toEqual(baseUser);
  });
});

describe("requireApiAuth — authorization", () => {
  it("returns 403 when role required and user lacks it", async () => {
    mockedRequireUser.mockResolvedValue(baseUser);
    const gate = await requireApiAuth({ role: "super_admin" });
    expect(gate.actor).toBeNull();
    expect(gate.error!.status).toBe(403);
    const body = await gate.error!.json();
    expect(body.error).toBe("FORBIDDEN");
    expect(body.message).toMatch(/super_admin/);
  });

  it("returns the actor when role required and user has it", async () => {
    mockedRequireUser.mockResolvedValue({
      ...baseUser,
      roles: ["clinician", "super_admin"],
    });
    const gate = await requireApiAuth({ role: "super_admin" });
    expect(gate.error).toBeNull();
    expect(gate.actor?.roles).toContain("super_admin");
  });
});

describe("requireApiAuth — bootstrap super-admin", () => {
  it("invokes bootstrap by default when role === super_admin", async () => {
    mockedRequireUser.mockResolvedValue({
      ...baseUser,
      roles: ["super_admin"],
    });
    await requireApiAuth({ role: "super_admin" });
    expect(mockedBootstrap).toHaveBeenCalledTimes(1);
  });

  it("does NOT invoke bootstrap by default when role !== super_admin", async () => {
    mockedRequireUser.mockResolvedValue(baseUser);
    await requireApiAuth({ role: "clinician" });
    expect(mockedBootstrap).not.toHaveBeenCalled();
  });

  it("respects bootstrapSuperAdmin: false override", async () => {
    mockedRequireUser.mockResolvedValue({
      ...baseUser,
      roles: ["super_admin"],
    });
    await requireApiAuth({
      role: "super_admin",
      bootstrapSuperAdmin: false,
    });
    expect(mockedBootstrap).not.toHaveBeenCalled();
  });

  it("falls through to role check when bootstrap throws", async () => {
    // User already has the role via Membership — bootstrap path is
    // best-effort and shouldn't fail the request.
    mockedRequireUser.mockResolvedValue({
      ...baseUser,
      roles: ["super_admin"],
    });
    mockedBootstrap.mockRejectedValue(new Error("DB connection lost"));

    const gate = await requireApiAuth({ role: "super_admin" });
    expect(gate.error).toBeNull();
    expect(gate.actor?.roles).toContain("super_admin");
  });
});

describe("requireApiAuth — rate limiting", () => {
  it("returns 429 with Retry-After when limiter rejects", async () => {
    mockedRequireUser.mockResolvedValue(baseUser);
    const limiter = {
      check: vi.fn().mockReturnValue({
        allowed: false,
        resetAt: Date.now() + 60_000,
      }),
    };

    const gate = await requireApiAuth({
      rateLimit: { limiter, bucket: "test.bucket" },
    });

    expect(gate.actor).toBeNull();
    expect(gate.error!.status).toBe(429);

    const retryAfter = Number(gate.error!.headers.get("Retry-After"));
    // ~60 seconds, allowing ms drift between resetAt and assertion.
    // The helper rounds up so it's always >= 1.
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(61);

    const body = await gate.error!.json();
    expect(body.error).toBe("RATE_LIMITED");
    expect(body.bucket).toBe("test.bucket");
    expect(typeof body.retryAfter).toBe("number");
  });

  it("returns the actor when limiter allows", async () => {
    mockedRequireUser.mockResolvedValue(baseUser);
    const limiter = {
      check: vi.fn().mockReturnValue({
        allowed: true,
        resetAt: Date.now() + 60_000,
      }),
    };

    const gate = await requireApiAuth({
      rateLimit: { limiter, bucket: "test.bucket" },
    });

    expect(gate.error).toBeNull();
    expect(gate.actor).toEqual(baseUser);
    expect(limiter.check).toHaveBeenCalledWith(baseUser.id);
  });

  it("never invokes limiter when auth fails (no key leakage)", async () => {
    mockedRequireUser.mockRejectedValue(new Error("UNAUTHORIZED"));
    const limiter = { check: vi.fn() };

    await requireApiAuth({
      rateLimit: { limiter, bucket: "test.bucket" },
    });
    expect(limiter.check).not.toHaveBeenCalled();
  });

  it("never invokes limiter when role check fails (limiter is post-authZ)", async () => {
    mockedRequireUser.mockResolvedValue(baseUser);
    const limiter = { check: vi.fn() };

    await requireApiAuth({
      role: "super_admin",
      rateLimit: { limiter, bucket: "test.bucket" },
    });
    expect(limiter.check).not.toHaveBeenCalled();
  });

  it("returns 429 with default bucket label when none provided", async () => {
    mockedRequireUser.mockResolvedValue(baseUser);
    const limiter = {
      check: vi.fn().mockReturnValue({
        allowed: false,
        resetAt: Date.now() + 1_000,
      }),
    };

    const gate = await requireApiAuth({ rateLimit: { limiter } });
    const body = await gate.error!.json();
    expect(body.bucket).toBeNull();
  });
});

describe("requireApiAuth — error envelope", () => {
  it("401 body has stable shape { error, message }", async () => {
    mockedRequireUser.mockRejectedValue(new Error("UNAUTHORIZED"));
    const gate = await requireApiAuth();
    const body = await gate.error!.json();
    expect(body).toMatchObject({
      error: "UNAUTHORIZED",
      message: expect.any(String),
    });
  });

  it("403 body has stable shape { error, message }", async () => {
    mockedRequireUser.mockResolvedValue(baseUser);
    const gate = await requireApiAuth({ role: "super_admin" });
    const body = await gate.error!.json();
    expect(body).toMatchObject({
      error: "FORBIDDEN",
      message: expect.any(String),
    });
  });

  it("429 body has stable shape { error, bucket, retryAfter }", async () => {
    mockedRequireUser.mockResolvedValue(baseUser);
    const limiter = {
      check: vi.fn().mockReturnValue({
        allowed: false,
        resetAt: Date.now() + 30_000,
      }),
    };
    const gate = await requireApiAuth({
      rateLimit: { limiter, bucket: "x" },
    });
    const body = await gate.error!.json();
    expect(body).toMatchObject({
      error: "RATE_LIMITED",
      bucket: "x",
      retryAfter: expect.any(Number),
    });
  });
});
