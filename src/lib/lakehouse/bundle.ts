/**
 * LeafBridge Lakehouse — FHIR Bundle builders.
 *
 * Small, pure helpers that wrap a set of resources in a conformant R4 Bundle
 * (searchset / history / collection). Kept separate from the engine so route
 * handlers and tests can format results without instantiating the store.
 */
import type { FhirBundle, FhirJson, StoredResource } from "./types";

const BASE = "https://leafbridge.leafjourney.com/fhir";

function fullUrl(r: FhirJson): string {
  return `${BASE}/${r.resourceType}/${r.id ?? ""}`;
}

/** A `searchset` Bundle. `total` is the full match count (pre-pagination). */
export function searchsetBundle(
  matches: FhirJson[],
  opts: { total?: number; includes?: FhirJson[]; selfUrl?: string } = {},
): FhirBundle {
  const entry: FhirBundle["entry"] = matches.map((resource) => ({
    fullUrl: fullUrl(resource),
    resource,
    search: { mode: "match" as const },
  }));
  for (const inc of opts.includes ?? []) {
    entry.push({ fullUrl: fullUrl(inc), resource: inc, search: { mode: "include" as const } });
  }
  return {
    resourceType: "Bundle",
    type: "searchset",
    total: opts.total ?? matches.length,
    link: opts.selfUrl ? [{ relation: "self", url: opts.selfUrl }] : undefined,
    entry,
  };
}

/** A `history` Bundle from a resource's version stack (newest first). */
export function historyBundle(versions: StoredResource[]): FhirBundle {
  return {
    resourceType: "Bundle",
    type: "history",
    total: versions.length,
    entry: versions.map((v) => ({
      fullUrl: fullUrl(v.body),
      resource: v.body,
      request: {
        method: v.versionId === "1" ? "POST" : v.deleted ? "DELETE" : "PUT",
        url: v.deleted ? `${v.resourceType}/${v.resourceId}` : `${v.resourceType}/${v.resourceId}`,
      },
      response: {
        status: v.deleted ? "204" : v.versionId === "1" ? "201" : "200",
        etag: `W/"${v.versionId}"`,
        lastModified: v.lastUpdated,
      },
    })),
  };
}

/** A `collection` Bundle (used by patient `$everything`). */
export function collectionBundle(resources: FhirJson[]): FhirBundle {
  return {
    resourceType: "Bundle",
    type: "collection",
    total: resources.length,
    entry: resources.map((resource) => ({ fullUrl: fullUrl(resource), resource })),
  };
}
