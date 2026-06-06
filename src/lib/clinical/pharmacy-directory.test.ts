import { describe, expect, it } from "vitest";
import { PHARMACIES, searchPharmacies } from "./pharmacy-directory";

// EMR-892 — preferred pharmacy directory

describe("PHARMACIES", () => {
  it("is non-empty with unique ids and required fields", () => {
    expect(PHARMACIES.length).toBeGreaterThanOrEqual(12);
    const seen = new Set<string>();
    for (const p of PHARMACIES) {
      expect(seen.has(p.id)).toBe(false);
      seen.add(p.id);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.address.length).toBeGreaterThan(0);
      expect(p.city.length).toBeGreaterThan(0);
      expect(p.state.length).toBeGreaterThan(0);
      expect(p.zip).toMatch(/^\d{5}$/);
      expect(p.phone.length).toBeGreaterThan(0);
    }
  });

  it("includes a mix of chains and independents", () => {
    const names = PHARMACIES.map((p) => p.name).join(" ");
    expect(names).toMatch(/CVS/);
    expect(names).toMatch(/Walgreens/);
    expect(names).toMatch(/Rite Aid/);
  });
});

describe("searchPharmacies", () => {
  it("matches by name fragment, case-insensitively", () => {
    const r = searchPharmacies("cvs");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((p) => p.name.toLowerCase().includes("cvs"))).toBe(true);
  });

  it("matches by city, zip, and county", () => {
    expect(searchPharmacies("Oakland").length).toBeGreaterThan(0);
    expect(searchPharmacies("94040").length).toBeGreaterThan(0);
    expect(searchPharmacies("Santa Clara").length).toBeGreaterThan(0);
  });

  it("returns the head of the directory for an empty query and honors limit", () => {
    expect(searchPharmacies("").length).toBeLessThanOrEqual(10);
    expect(searchPharmacies("", 3).length).toBe(3);
    expect(searchPharmacies("ca", 2).length).toBe(2);
  });

  it("returns empty for a no-match query", () => {
    expect(searchPharmacies("zzzz-no-match")).toEqual([]);
  });
});
