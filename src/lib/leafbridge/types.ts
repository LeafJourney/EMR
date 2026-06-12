/**
 * LeafBridge — app-side type contract for the FHIR persistence spine.
 *
 * These types MIRROR the framework-free LeafBridge workspace
 * (`leafbridge/fhir-persistence/types.ts` + `store.ts`) verbatim. The Next app
 * deliberately excludes `leafbridge/` from its TypeScript build (see the root
 * tsconfig `exclude`), so the app provides its own Prisma-backed adapter against
 * a structural copy of the store interface. Keep these in sync with the
 * LeafBridge source of truth until the spine is published as a package; the
 * shapes are intentionally identical so swapping to a direct import is trivial.
 */

/** Any FHIR R4 resource — `body` is stored as-is (genuinely open shape). */
export interface FhirResource {
  resourceType: string;
  id?: string;
  meta?: {
    versionId?: string;
    lastUpdated?: string;
  } & Record<string, unknown>;
  [key: string]: unknown;
}

export interface FhirBundleEntry {
  resource?: FhirResource;
  fullUrl?: string;
}

export interface FhirBundle {
  resourceType: "Bundle";
  type?: string;
  entry?: FhirBundleEntry[];
  [key: string]: unknown;
}

/** A persisted, versioned FHIR resource row. */
export interface StoredResource {
  organizationId: string;
  resourceType: string;
  resourceId: string;
  versionId: string;
  /** ISO-8601 timestamp. */
  lastUpdated: string;
  body: FhirResource;
}

export interface BundlePersistResult {
  organizationId: string;
  bundleSize: number;
  storedCount: number;
  skippedCount: number;
  skipped: ReadonlyArray<{ index: number; reason: string }>;
}

/**
 * The narrow store seam every persistence backend implements. The in-memory
 * store (tests/dev) and the Prisma store (Postgres) are interchangeable behind
 * it — exactly the LeafBridge `FhirResourceStore` contract.
 */
export interface FhirResourceStore {
  put(resource: StoredResource): Promise<void>;
  get(
    organizationId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<StoredResource | null>;
  listByType(
    organizationId: string,
    resourceType: string,
  ): Promise<ReadonlyArray<StoredResource>>;
}
