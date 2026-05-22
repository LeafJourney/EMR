import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import { describe, it, expect, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    membership: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
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

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import {
  clerkUserHasMfa,
  resolveSuperAdminMfaState,
  buildMfaRequiredResponse,
  MfaRequiredError,
  SUPER_ADMIN_MFA_GRACE_MS,
} from "./super-admin-mfa";
import type { AuthedUser } from "./session";

const mockedPrisma = vi.mocked(prisma, true) as unknown as {
  membership: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};

const superAdmin: AuthedUser = {
  id: "user_super",
  email: "super@leafjourney.com",
  firstName: "Super",
  lastName: "Admin",
  roles: ["super_admin"],
  organizationId: "org_hq",
  organizationName: "LeafJourney HQ",
};

const clinician: AuthedUser = {
  ...superAdmin,
  id: "user_clin",
  email: "clin@example.com",
  roles: ["clinician"],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SUPER_ADMIN_MFA_ENFORCE", "1");
});

describe("clerkUserHasMfa", () => {
  it("returns false for null user", () => {
    expect(clerkUserHasMfa(null)).toBe(false);
  });

  it("returns true when twoFactorEnabled is set", () => {
    expect(
      clerkUserHasMfa({
        twoFactorEnabled: true,
        totpEnabled: false,
        backupCodeEnabled: false,
      }),
    ).toBe(true);
  });

  it("returns true when only totpEnabled is set", () => {
    expect(
      clerkUserHasMfa({
        twoFactorEnabled: false,
        totpEnabled: true,
        backupCodeEnabled: false,
      }),
    ).toBe(true);
  });

  it("returns true when only backupCodeEnabled is set", () => {
    expect(
      clerkUserHasMfa({
        twoFactorEnabled: false,
        totpEnabled: false,
        backupCodeEnabled: true,
      }),
    ).toBe(true);
  });

  it("returns false when no factor is enabled", () => {
    expect(
      clerkUserHasMfa({
        twoFactorEnabled: false,
        totpEnabled: false,
        backupCodeEnabled: false,
      }),
    ).toBe(false);
  });
});

describe("resolveSuperAdminMfaState", () => {
  it("returns not_super for non-super_admin actors", async () => {
    const state = await resolveSuperAdminMfaState(clinician, null);
    expect(state.status).toBe("not_super");
  });

  it("returns enrolled when MFA is on", async () => {
    const state = await resolveSuperAdminMfaState(superAdmin, {
      twoFactorEnabled: true,
      totpEnabled: false,
      backupCodeEnabled: false,
    });
    expect(state.status).toBe("enrolled");
    expect(mockedPrisma.membership.updateMany).toHaveBeenCalled();
  });

  it("stamps grace + returns grace on first observation of unenrolled super_admin", async () => {
    mockedPrisma.membership.findFirst.mockResolvedValue({
      id: "m_1",
      mfaGraceUntil: null,
    });
    mockedPrisma.membership.update.mockResolvedValue({});

    const state = await resolveSuperAdminMfaState(superAdmin, {
      twoFactorEnabled: false,
      totpEnabled: false,
      backupCodeEnabled: false,
    });

    expect(state.status).toBe("grace");
    if (state.status === "grace") {
      const now = Date.now();
      const elapsed = state.graceUntil.getTime() - now;
      expect(elapsed).toBeGreaterThan(SUPER_ADMIN_MFA_GRACE_MS - 5000);
      expect(elapsed).toBeLessThanOrEqual(SUPER_ADMIN_MFA_GRACE_MS + 5000);
    }
    expect(mockedPrisma.membership.update).toHaveBeenCalledTimes(1);
  });

  it("returns grace (no stamp) when graceUntil is still in the future", async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    mockedPrisma.membership.findFirst.mockResolvedValue({
      id: "m_2",
      mfaGraceUntil: future,
    });

    const state = await resolveSuperAdminMfaState(superAdmin, {
      twoFactorEnabled: false,
      totpEnabled: false,
      backupCodeEnabled: false,
    });

    expect(state.status).toBe("grace");
    expect(mockedPrisma.membership.update).not.toHaveBeenCalled();
  });

  it("returns blocked when grace has expired", async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockedPrisma.membership.findFirst.mockResolvedValue({
      id: "m_3",
      mfaGraceUntil: past,
    });

    const state = await resolveSuperAdminMfaState(superAdmin, {
      twoFactorEnabled: false,
      totpEnabled: false,
      backupCodeEnabled: false,
    });

    expect(state.status).toBe("blocked");
  });

  it("returns blocked when no Membership row matches", async () => {
    mockedPrisma.membership.findFirst.mockResolvedValue(null);
    const state = await resolveSuperAdminMfaState(superAdmin, null);
    expect(state.status).toBe("blocked");
    if (state.status === "blocked") {
      expect(state.graceUntil).toBeNull();
    }
  });

  it("bypasses enforcement when SUPER_ADMIN_MFA_ENFORCE=0 in non-prod", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SUPER_ADMIN_MFA_ENFORCE", "0");
    const state = await resolveSuperAdminMfaState(superAdmin, null);
    expect(state.status).toBe("enrolled");
  });

  it("DOES enforce in production even with SUPER_ADMIN_MFA_ENFORCE=0", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPER_ADMIN_MFA_ENFORCE", "0");
    mockedPrisma.membership.findFirst.mockResolvedValue({
      id: "m_4",
      mfaGraceUntil: null,
    });
    mockedPrisma.membership.update.mockResolvedValue({});

    const state = await resolveSuperAdminMfaState(superAdmin, null);
    expect(state.status).toBe("grace");
  });
});

describe("buildMfaRequiredResponse", () => {
  it("returns a 403 with the structured envelope", async () => {
    const grace = new Date("2026-06-01T00:00:00Z");
    const res = buildMfaRequiredResponse(grace);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("mfa_required");
    expect(body.error).toBe("MFA_REQUIRED");
    expect(body.enrollUrl).toBe("/sign-in/factor-two");
    expect(body.graceUntil).toBe("2026-06-01T00:00:00.000Z");
  });

  it("serialises null graceUntil as null", async () => {
    const res = buildMfaRequiredResponse(null);
    const body = await res.json();
    expect(body.graceUntil).toBeNull();
  });
});

describe("MfaRequiredError", () => {
  it("carries the typed code + graceUntil", () => {
    const err = new MfaRequiredError(new Date("2026-06-01T00:00:00Z"));
    expect(err.code).toBe("MFA_REQUIRED");
    expect(err.message).toBe("MFA_REQUIRED");
    expect(err.graceUntil?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
});

