// EMR-728 — withAdminMutation contract tests.
//
// Why unit-level? The helper's value is its envelope: same gate + same
// audit shape on every controller mutation. Snapshot/shape assertions
// over inputs → outputs catch regressions that an HTTP smoke spec would
// require Clerk + Prisma + Postgres to surface.

import { vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("./impersonation", () => ({
  readImpersonationFromCookies: () => Promise.resolve(null),
}));

vi.mock("./session", () => ({
  requireUser: vi.fn(),
}));

vi.mock("./super-admin-bootstrap", () => ({
  bootstrapSuperAdminIfAllowlisted: vi.fn(),
}));

vi.mock("./super-admin-mfa", () => ({
  loadSuperAdminMfaState: async () => ({ status: "enrolled" }),
  buildMfaRequiredResponse: () => new Response(JSON.stringify({}), { status: 403 }),
}));

vi.mock("./impersonation", () => ({
  readImpersonationFromCookies: vi.fn().mockResolvedValue(null),
  IMPERSONATION_COOKIE: "lj_impersonation",
}));




vi.mock("./audit-stub", () => ({
  logControllerAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./rate-limit", () => ({
  adminMutationLimiter: { check: vi.fn().mockReturnValue({ allowed: true, resetAt: Date.now() + 60_000 }) },
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



import { describe, it, expect, beforeEach } from "vitest";
import { NextResponse } from "next/server";

import { requireUser } from "./session";
import { bootstrapSuperAdminIfAllowlisted } from "./super-admin-bootstrap";
import { logControllerAction } from "./audit-stub";
import { adminMutationLimiter } from "./rate-limit";
import { withAdminMutation } from "./with-admin-mutation";

const mockedRequireUser = vi.mocked(requireUser);
const mockedBootstrap = vi.mocked(bootstrapSuperAdminIfAllowlisted);
const mockedAudit = vi.mocked(logControllerAction);
const mockedLimiter = vi.mocked(adminMutationLimiter);

const superAdmin = {
  id: "user_001",
  email: "alice@example.com",
  firstName: "Alice",
  lastName: "Example",
  roles: ["super_admin" as const],
  organizationId: "org_001",
  organizationName: "Test Org",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedBootstrap.mockResolvedValue(false);
  mockedLimiter.check.mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 });
});

function makeReq(url = "https://app.example.com/api/admin/x") {
  return new Request(url, { method: "POST" });
}

describe("withAdminMutation — happy path", () => {
  it("calls the limiter with the actor id and the configured bucket", async () => {
    mockedRequireUser.mockResolvedValue(superAdmin);
    const handler = withAdminMutation(
      { bucket: "admin.test.create" },
      async () => NextResponse.json({ ok: true }),
    );
    await handler(makeReq(), { params: {} });
    expect(mockedLimiter.check).toHaveBeenCalledWith(superAdmin.id);
  });

  it("emits exactly one audit row tagged controller.<bucket>.ok on success", async () => {
    mockedRequireUser.mockResolvedValue(superAdmin);
    const handler = withAdminMutation(
      { bucket: "admin.test.create" },
      async () => NextResponse.json({ ok: true }),
    );
    await handler(makeReq("https://app.example.com/api/admin/test"), { params: { id: "obj_42" } });
    expect(mockedAudit).toHaveBeenCalledTimes(1);
    expect(mockedAudit.mock.calls[0][0]).toMatchObject({
      action: "controller.admin.test.create.ok",
      targetId: "obj_42",
      actor: superAdmin,
    });
  });

  it("returns the handler's response body unchanged", async () => {
    mockedRequireUser.mockResolvedValue(superAdmin);
    const handler = withAdminMutation(
      { bucket: "admin.test.create" },
      async () => NextResponse.json({ value: 7 }, { status: 201 }),
    );
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ value: 7 });
  });
});

describe("withAdminMutation — denial paths", () => {
  it("returns 401 when unauthenticated and does NOT audit", async () => {
    mockedRequireUser.mockRejectedValue(new Error("UNAUTHORIZED"));
    const handler = withAdminMutation(
      { bucket: "admin.test.create" },
      async () => NextResponse.json({ ok: true }),
    );
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(401);
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("returns 403 when actor lacks role and does NOT audit", async () => {
    mockedRequireUser.mockResolvedValue({ ...superAdmin, roles: ["clinician"] });
    const handler = withAdminMutation(
      { bucket: "admin.test.create" },
      async () => NextResponse.json({ ok: true }),
    );
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(403);
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("returns 429 when limiter rejects and does NOT audit", async () => {
    mockedRequireUser.mockResolvedValue(superAdmin);
    mockedLimiter.check.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });
    const handler = withAdminMutation(
      { bucket: "admin.test.create" },
      async () => NextResponse.json({ ok: true }),
    );
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(429);
    expect(mockedAudit).not.toHaveBeenCalled();
  });
});

describe("withAdminMutation — error path", () => {
  it("returns 500 and emits a controller.<bucket>.error audit row when handler throws", async () => {
    mockedRequireUser.mockResolvedValue(superAdmin);
    const handler = withAdminMutation(
      { bucket: "admin.test.create" },
      async () => {
        throw new Error("boom");
      },
    );
    const res = await handler(makeReq(), { params: { id: "obj_99" } });
    expect(res.status).toBe(500);
    expect(mockedAudit).toHaveBeenCalledTimes(1);
    expect(mockedAudit.mock.calls[0][0]).toMatchObject({
      action: "controller.admin.test.create.error",
      targetId: "obj_99",
      reason: "boom",
    });
  });

  it("never lets an audit-write failure turn a 200 into a 500", async () => {
    mockedRequireUser.mockResolvedValue(superAdmin);
    mockedAudit.mockRejectedValueOnce(new Error("db down"));
    const handler = withAdminMutation(
      { bucket: "admin.test.create" },
      async () => NextResponse.json({ ok: true }),
    );
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(200);
  });
});

describe("withAdminMutation — implementation_admin role union", () => {
  it("accepts implementation_admin actors", async () => {
    mockedRequireUser.mockResolvedValue({
      ...superAdmin,
      roles: ["implementation_admin"],
    });
    const handler = withAdminMutation(
      { bucket: "admin.config.publish", role: "implementation_admin" },
      async () => NextResponse.json({ ok: true }),
    );
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(200);
  });

  it("accepts super_admin actors on an implementation_admin-gated route", async () => {
    mockedRequireUser.mockResolvedValue({
      ...superAdmin,
      roles: ["super_admin"],
    });
    const handler = withAdminMutation(
      { bucket: "admin.config.publish", role: "implementation_admin" },
      async () => NextResponse.json({ ok: true }),
    );
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(200);
  });

  it("rejects clinicians on an implementation_admin-gated route", async () => {
    mockedRequireUser.mockResolvedValue({
      ...superAdmin,
      roles: ["clinician"],
    });
    const handler = withAdminMutation(
      { bucket: "admin.config.publish", role: "implementation_admin" },
      async () => NextResponse.json({ ok: true }),
    );
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(403);
  });
});
