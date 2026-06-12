import { describe, it, expect } from "vitest";
import {
  persistFhirBundle,
  getStoredResource,
  listStoredByType,
} from "./fhir-persistence";
import { InMemoryFhirResourceStore } from "./fhir-resource-store";
import type { FhirBundle } from "./types";

const ORG = "org-demo";
const fixedNow = () => new Date("2026-06-11T00:00:00.000Z");

function bundle(entries: Array<Record<string, unknown> | null>): FhirBundle {
  return {
    resourceType: "Bundle",
    type: "collection",
    entry: entries.map((resource) => (resource ? { resource } : {})),
  } as FhirBundle;
}

describe("persistFhirBundle", () => {
  it("persists each valid resource and reports counts", async () => {
    const store = new InMemoryFhirResourceStore();
    const result = await persistFhirBundle(
      ORG,
      bundle([
        { resourceType: "Patient", id: "p1" },
        { resourceType: "Observation", id: "o1" },
      ]),
      { store, now: fixedNow },
    );

    expect(result).toEqual({
      organizationId: ORG,
      bundleSize: 2,
      storedCount: 2,
      skippedCount: 0,
      skipped: [],
    });
    expect(store.size()).toBe(2);

    const p = await getStoredResource(ORG, "Patient", "p1", store);
    expect(p?.body).toMatchObject({ resourceType: "Patient", id: "p1" });
    expect(p?.organizationId).toBe(ORG);
  });

  it("honors meta.versionId / meta.lastUpdated, else defaults to '1' and now()", async () => {
    const store = new InMemoryFhirResourceStore();
    await persistFhirBundle(
      ORG,
      bundle([
        { resourceType: "Patient", id: "withMeta", meta: { versionId: "7", lastUpdated: "2025-01-02T03:04:05.000Z" } },
        { resourceType: "Patient", id: "noMeta" },
      ]),
      { store, now: fixedNow },
    );

    const withMeta = await getStoredResource(ORG, "Patient", "withMeta", store);
    expect(withMeta?.versionId).toBe("7");
    expect(withMeta?.lastUpdated).toBe("2025-01-02T03:04:05.000Z");

    const noMeta = await getStoredResource(ORG, "Patient", "noMeta", store);
    expect(noMeta?.versionId).toBe("1");
    expect(noMeta?.lastUpdated).toBe("2026-06-11T00:00:00.000Z");
  });

  it("skips entries with no resource or no id, with reasons", async () => {
    const store = new InMemoryFhirResourceStore();
    const result = await persistFhirBundle(
      ORG,
      bundle([
        null, // entry with no resource
        { resourceType: "Observation" }, // no id
        { resourceType: "Patient", id: "ok" },
      ]),
      { store, now: fixedNow },
    );

    expect(result.storedCount).toBe(1);
    expect(result.skippedCount).toBe(2);
    expect(result.skipped).toEqual([
      { index: 0, reason: "entry missing resource" },
      { index: 1, reason: "Observation missing id" },
    ]);
    expect(store.size()).toBe(1);
  });

  it("re-persisting a resource upserts in place (same composite key)", async () => {
    const store = new InMemoryFhirResourceStore();
    await persistFhirBundle(ORG, bundle([{ resourceType: "Patient", id: "p1", meta: { versionId: "1" } }]), { store, now: fixedNow });
    await persistFhirBundle(ORG, bundle([{ resourceType: "Patient", id: "p1", meta: { versionId: "2" }, name: [{ family: "Updated" }] }]), { store, now: fixedNow });

    expect(store.size()).toBe(1);
    const p = await getStoredResource(ORG, "Patient", "p1", store);
    expect(p?.versionId).toBe("2");
    expect(p?.body).toMatchObject({ name: [{ family: "Updated" }] });
  });

  it("scopes reads by organization and type", async () => {
    const store = new InMemoryFhirResourceStore();
    await persistFhirBundle("org-a", bundle([{ resourceType: "Patient", id: "p1" }]), { store, now: fixedNow });
    await persistFhirBundle("org-b", bundle([{ resourceType: "Patient", id: "p2" }]), { store, now: fixedNow });

    const aPatients = await listStoredByType("org-a", "Patient", store);
    expect(aPatients.map((r) => r.resourceId)).toEqual(["p1"]);

    // No cross-tenant leak.
    expect(await getStoredResource("org-a", "Patient", "p2", store)).toBeNull();
    // No cross-type leak.
    expect(await listStoredByType("org-a", "Observation", store)).toEqual([]);
  });

  it("throws on a structurally invalid bundle", async () => {
    const store = new InMemoryFhirResourceStore();
    await expect(
      persistFhirBundle(ORG, { resourceType: "Patient" }, { store, now: fixedNow }),
    ).rejects.toThrow(/invalid FHIR Bundle/);
  });

  it("throws when organizationId is missing", async () => {
    const store = new InMemoryFhirResourceStore();
    await expect(
      persistFhirBundle("", bundle([{ resourceType: "Patient", id: "p1" }]), { store, now: fixedNow }),
    ).rejects.toThrow(/organizationId is required/);
  });

  it("treats an empty bundle as a no-op", async () => {
    const store = new InMemoryFhirResourceStore();
    const result = await persistFhirBundle(ORG, bundle([]), { store, now: fixedNow });
    expect(result.bundleSize).toBe(0);
    expect(result.storedCount).toBe(0);
    expect(store.size()).toBe(0);
  });
});
