import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock react cache before importing clerk-session
vi.mock("react", () => ({
  cache: (fn: any) => fn,
}));

// Mock next/headers cookies
const mockGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: mockGet,
  }),
}));

// Mock @clerk/nextjs/server auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: null }),
  currentUser: vi.fn().mockResolvedValue(null),
}));

// Mock prisma.user.findFirst
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));

import { getCurrentUserFromClerk } from "../clerk-session";
import { prisma } from "@/lib/db/prisma";

describe("getCurrentUserFromClerk dev mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (process.env as any).NODE_ENV = "development";
  });

  it("should default to clinician@demo.health when no override cookie is set", async () => {
    mockGet.mockReturnValue(undefined);
    const mockUser = {
      id: "clinician-123",
      email: "clinician@demo.health",
      firstName: "Lena",
      lastName: "Okafor",
      memberships: [
        {
          role: "clinician",
          organizationId: "org-123",
          organization: { name: "Green Path" },
        },
      ],
    };

    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as any);

    const result = await getCurrentUserFromClerk();

    expect(mockGet).toHaveBeenCalledWith("dev_user_email");
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: "clinician@demo.health" },
      include: expect.any(Object),
    });
    expect(result).toEqual({
      id: "clinician-123",
      email: "clinician@demo.health",
      firstName: "Lena",
      lastName: "Okafor",
      roles: ["clinician"],
      organizationId: "org-123",
      organizationName: "Green Path",
    });
  });

  it("should look up dev_user_email value when cookie is set", async () => {
    mockGet.mockReturnValue({ value: "owner@demo.health" });
    const mockUser = {
      id: "owner-123",
      email: "owner@demo.health",
      firstName: "Avery",
      lastName: "Hale",
      memberships: [
        {
          role: "practice_owner",
          organizationId: "org-123",
          organization: { name: "Green Path" },
        },
      ],
    };

    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as any);

    const result = await getCurrentUserFromClerk();

    expect(mockGet).toHaveBeenCalledWith("dev_user_email");
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: "owner@demo.health" },
      include: expect.any(Object),
    });
    expect(result?.email).toBe("owner@demo.health");
    expect(result?.roles).toContain("practice_owner");
  });
});
