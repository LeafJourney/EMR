// EMR-002 — Tests for GET /api/dispensary/nearby

import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    dispensary: {
      findMany: vi.fn(),
    },
  };

  const geocodeAddress = vi.fn();
  const filterNearby = vi.fn();

  return { mockPrisma, geocodeAddress, filterNearby };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: hoisted.mockPrisma,
}));

vi.mock("@/lib/dispensary", () => ({
  geocodeAddress: hoisted.geocodeAddress,
  filterNearby: hoisted.filterNearby,
}));

import { GET } from "./route";

function makeRequest(query: Record<string, string>): Request {
  const params = new URLSearchParams(query);
  return new Request(`https://example.com/api/dispensary/nearby?${params.toString()}`);
}

describe("GET /api/dispensary/nearby", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 if address is missing", async () => {
    const req = new Request("https://example.com/api/dispensary/nearby");

    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("address_required");
    expect(hoisted.geocodeAddress).not.toHaveBeenCalled();
  });

  it("returns 400 if address is blank", async () => {
    const req = makeRequest({ address: "   " });

    const res = await GET(req);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("address_required");
  });

  it("returns 400 if radius is not a positive number", async () => {
    const req = makeRequest({ address: "Seattle, WA", radius: "not-a-number" });

    const res = await GET(req);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_radius");
  });

  it("returns 400 if radius is zero or negative", async () => {
    const req = makeRequest({ address: "Seattle, WA", radius: "0" });

    const res = await GET(req);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_radius");
  });

  it("geocodes, fetches active dispensaries, and returns filterNearby results", async () => {
    const origin = { lat: 47.6062, lng: -122.3321 };
    hoisted.geocodeAddress.mockResolvedValue(origin);

    const dispensaryRows = [
      {
        id: "d1",
        slug: "leaf-1",
        name: "Leaf One",
        status: "active",
        latitude: 47.6062,
        longitude: -122.3321,
        addressLine1: "1 Main",
        addressLine2: null,
        city: "Seattle",
        state: "WA",
        postalCode: "98101",
        phone: null,
        websiteUrl: null,
        hoursLine: null,
        lastSyncedAt: null,
        _count: { skus: 3 },
      },
    ];
    hoisted.mockPrisma.dispensary.findMany.mockResolvedValue(dispensaryRows);

    const filtered = [
      {
        id: "d1",
        slug: "leaf-1",
        name: "Leaf One",
        geo: {
          lat: 47.6062,
          lng: -122.3321,
          addressLine1: "1 Main",
          city: "Seattle",
          state: "WA",
          postalCode: "98101",
        },
        distanceMiles: 0,
        skuCount: 3,
        skus: [],
      },
    ];
    hoisted.filterNearby.mockReturnValue(filtered);

    const req = makeRequest({ address: "Seattle, WA" });

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.origin).toEqual(origin);
    expect(body.radiusMiles).toBe(30);
    expect(body.results).toEqual(filtered);

    expect(hoisted.geocodeAddress).toHaveBeenCalledWith("Seattle, WA");
    expect(hoisted.mockPrisma.dispensary.findMany).toHaveBeenCalledTimes(1);
    expect(hoisted.filterNearby).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "d1", skuCount: 3 }),
      ]),
      origin,
      30,
    );
  });

  it("uses the provided radius when supplied", async () => {
    hoisted.geocodeAddress.mockResolvedValue({ lat: 1, lng: 2 });
    hoisted.mockPrisma.dispensary.findMany.mockResolvedValue([]);
    hoisted.filterNearby.mockReturnValue([]);

    const req = makeRequest({ address: "Anywhere", radius: "15" });

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.radiusMiles).toBe(15);
    expect(hoisted.filterNearby).toHaveBeenCalledWith(
      expect.any(Array),
      { lat: 1, lng: 2 },
      15,
    );
  });
});
