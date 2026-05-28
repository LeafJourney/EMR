import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    organization: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };
  return {
    mockPrisma,
    mockRequireImplementationAdmin: vi.fn(),
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: hoisted.mockPrisma,
}));

vi.mock("@/lib/auth/super-admin", () => ({
  requireImplementationAdmin: hoisted.mockRequireImplementationAdmin,
}));

import { GET, POST } from "./route";

describe("GET /api/orgs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when user is not an implementation admin", async () => {
    hoisted.mockRequireImplementationAdmin.mockRejectedValue(new Error("FORBIDDEN"));

    const req = new Request("https://example.com/api/orgs");
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it("searches and returns organizations successfully", async () => {
    hoisted.mockRequireImplementationAdmin.mockResolvedValue({ id: "admin-1" });
    const mockOrgs = [
      {
        id: "org-1",
        name: "True Bloom Wellness",
        legalName: "True Bloom Wellness LLC",
        brandName: "True Bloom Wellness",
        practices: [],
      },
    ];
    hoisted.mockPrisma.organization.findMany.mockResolvedValue(mockOrgs);

    const req = new Request("https://example.com/api/orgs?q=Bloom");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organizations).toHaveLength(1);
    expect(body.organizations[0].name).toBe("True Bloom Wellness");
    expect(hoisted.mockPrisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: "Bloom", mode: "insensitive" } },
            { legalName: { contains: "Bloom", mode: "insensitive" } },
            { brandName: { contains: "Bloom", mode: "insensitive" } },
          ],
        },
      })
    );
  });
});

describe("POST /api/orgs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when user is not an implementation admin", async () => {
    hoisted.mockRequireImplementationAdmin.mockRejectedValue(new Error("FORBIDDEN"));

    const req = new Request("https://example.com/api/orgs", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid input", async () => {
    hoisted.mockRequireImplementationAdmin.mockResolvedValue({ id: "admin-1" });

    const req = new Request("https://example.com/api/orgs", {
      method: "POST",
      body: JSON.stringify({
        legalName: "",
        brandName: "True Bloom",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_input");
  });

  it("creates organization successfully", async () => {
    hoisted.mockRequireImplementationAdmin.mockResolvedValue({ id: "admin-1" });
    hoisted.mockPrisma.organization.findUnique.mockResolvedValue(null);
    hoisted.mockPrisma.organization.create.mockResolvedValue({
      id: "new-org-1",
      name: "True Bloom",
      legalName: "True Bloom LLC",
      brandName: "True Bloom",
    });

    const req = new Request("https://example.com/api/orgs", {
      method: "POST",
      body: JSON.stringify({
        legalName: "True Bloom LLC",
        brandName: "True Bloom",
        primaryContactName: "Jane Doe",
        primaryContactEmail: "jane@truebloom.com",
        phone: "(303) 555-1212",
        street: "123 Main St",
        city: "Denver",
        state: "CO",
        postalCode: "80202",
        timeZone: "America/Denver",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.organization.id).toBe("new-org-1");
    expect(hoisted.mockPrisma.organization.create).toHaveBeenCalled();
  });
});
