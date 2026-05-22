import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import { describe, it, expect, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: { upsert: vi.fn() },
    membership: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/observability/log", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("./bootstrap-audit", () => ({
  runBootstrapAllowlistAudit: vi.fn(),
}));

vi.mock("./super-admin-mfa", () => ({
  clerkUserHasMfa: vi.fn(),
  getCurrentClerkUserForMfa: vi.fn(),
}));

vi.mock("./audit-stub", () => ({
  logControllerAction: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { bootstrapSuperAdminIfAllowlisted } from "./super-admin-bootstrap";
import { clerkUserHasMfa, getCurrentClerkUserForMfa } from "./super-admin-mfa";
import type { AuthedUser } from "./session";

const mockedPrisma = vi.mocked(prisma, true) as unknown as {
  organization: { upsert: ReturnType<typeof vi.fn> };
  membership: { upsert: ReturnType<typeof vi.fn> };
};
const mockedClerkHasMfa = vi.mocked(clerkUserHasMfa);
const mockedClerkUser = vi.mocked(getCurrentClerkUserForMfa);

const allowlistedUser: AuthedUser = {
  id: "user_seed",
  email: "scott@leafjourney.com",
  firstName: "Scott",
  lastName: "Wayman",
  roles: ["clinician"],
  organizationId: "org_clinic",
  organizationName: "Test Clinic",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SUPER_ADMIN_BOOTSTRAP_ENABLED", "1");
  vi.stubEnv("SUPER_ADMIN_BOOTSTRAP_EMAILS", "scott@leafjourney.com,neal@leafjourney.com");
  vi.stubEnv("SUPER_ADMIN_MFA_ENFORCE", "1");
  mockedPrisma.organization.upsert.mockResolvedValue({ id: "org_hq" });
  mockedPrisma.membership.upsert.mockResolvedValue({});
  mockedClerkUser.mockResolvedValue({ id: "clerk_1" } as never);
});

describe("bootstrapSuperAdminIfAllowlisted — MFA gate (EMR-725)", () => {
  it("refuses to promote when MFA is not enrolled", async () => {
    mockedClerkHasMfa.mockReturnValue(false);
    const user = { ...allowlistedUser };
    const result = await bootstrapSuperAdminIfAllowlisted(user);

    expect(result).toBe(false);
    expect(user.roles).not.toContain("super_admin");
    expect(mockedPrisma.membership.upsert).not.toHaveBeenCalled();
  });

  it("promotes when MFA IS enrolled", async () => {
    mockedClerkHasMfa.mockReturnValue(true);
    const user = { ...allowlistedUser };
    const result = await bootstrapSuperAdminIfAllowlisted(user);

    expect(result).toBe(true);
    expect(user.roles).toContain("super_admin");
    expect(mockedPrisma.membership.upsert).toHaveBeenCalledTimes(1);
  });

  it("does not promote when email is not on the allowlist", async () => {
    vi.stubEnv("SUPER_ADMIN_BOOTSTRAP_EMAILS", "someone-else@leafjourney.com");
    mockedClerkHasMfa.mockReturnValue(true);
    const user = { ...allowlistedUser };
    const result = await bootstrapSuperAdminIfAllowlisted(user);

    expect(result).toBe(false);
    expect(mockedPrisma.membership.upsert).not.toHaveBeenCalled();
  });

  it("does not promote when bootstrap is disabled in prod", async () => {
    vi.stubEnv("SUPER_ADMIN_BOOTSTRAP_ENABLED", "");
    mockedClerkHasMfa.mockReturnValue(true);
    const user = { ...allowlistedUser };
    const result = await bootstrapSuperAdminIfAllowlisted(user);

    expect(result).toBe(false);
  });

  it("skips MFA check when SUPER_ADMIN_MFA_ENFORCE=0 in non-prod", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SUPER_ADMIN_MFA_ENFORCE", "0");
    mockedClerkHasMfa.mockReturnValue(false);
    const user = { ...allowlistedUser };
    const result = await bootstrapSuperAdminIfAllowlisted(user);

    expect(result).toBe(true);
    expect(user.roles).toContain("super_admin");
  });

  it("returns false when user already has super_admin (idempotent)", async () => {
    mockedClerkHasMfa.mockReturnValue(true);
    const user = { ...allowlistedUser, roles: ["super_admin" as const] };
    const result = await bootstrapSuperAdminIfAllowlisted(user);

    expect(result).toBe(false);
    expect(mockedPrisma.membership.upsert).not.toHaveBeenCalled();
  });
});
