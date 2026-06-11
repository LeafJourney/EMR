import { describe, it, expect } from "vitest";
import {
  getLakehouseCatalog,
  searchLakehouse,
  readLakehouseResource,
  getAuditTail,
  getCapabilityStatement,
  invalidateLakehouse,
} from "./lakehouse-data";

// Exercises the integration seam: the curated analytics resources (the DB-free
// fallback) are materialized into the engine and answered through the public
// helpers. No DB is required — getRealFhirResources() falls back to [].

describe("lakehouse-data integration", () => {
  it("materializes the curated demo resources into a non-empty catalog", async () => {
    invalidateLakehouse();
    const catalog = await getLakehouseCatalog();
    expect(catalog).not.toBeNull();
    expect(catalog!.totals.resources).toBeGreaterThan(0);
    // The curated set spans several FHIR resource types.
    expect(catalog!.resourceTypes.length).toBeGreaterThan(1);
    // Every zone is represented.
    expect(catalog!.zones.map((z) => z.zone)).toEqual([
      "bronze", "silver", "gold", "platinum", "vector", "audit",
    ]);
  });

  it("answers a live search and a read against materialized data", async () => {
    const catalog = await getLakehouseCatalog();
    const firstType = catalog!.resourceTypes[0].resourceType;
    const search = await searchLakehouse(firstType, {});
    expect(search.total).toBeGreaterThan(0);

    const first = search.resources[0];
    const read = await readLakehouseResource(firstType, String(first.id));
    expect(read?.id).toBe(first.id);
    // meta is stamped by the engine on ingest.
    expect(read?.meta?.versionId).toBe("1");
  });

  it("seals one audit event per materialized resource and verifies the chain", async () => {
    const catalog = await getLakehouseCatalog();
    const audit = await getAuditTail(500);
    expect(audit.total).toBe(catalog!.totals.resources);
    expect(audit.verified).toBe(true);
  });

  it("publishes a CapabilityStatement for the materialized types", async () => {
    const cap = await getCapabilityStatement();
    expect(cap?.resourceType).toBe("CapabilityStatement");
  });
});
