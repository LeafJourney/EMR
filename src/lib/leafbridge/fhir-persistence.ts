/**
 * LeafBridge — FHIR persistence service (app-side).
 *
 * A faithful port of `leafbridge/fhir-persistence/persistence.ts`'s
 * `persistBundle`, exposed as a function that writes through any
 * `FhirResourceStore` (defaulting to the Postgres-backed
 * `PrismaFhirResourceStore`). This is the Phase-1 outcome: ingest a FHIR
 * Bundle → versioned, organization-scoped FHIR rows, for real.
 *
 * Versioning intentionally matches LeafBridge: a resource's `meta.versionId`
 * is honored when present, else "1"; `meta.lastUpdated` else now(). The store
 * upserts on (organizationId, resourceType, resourceId), so re-persisting a
 * resource replaces it in place.
 */
import { z } from "zod";
import type {
  BundlePersistResult,
  FhirBundle,
  FhirResource,
  FhirResourceStore,
  StoredResource,
} from "./types";
import { PrismaFhirResourceStore } from "./fhir-resource-store";

const fhirResourceSchema = z
  .object({
    resourceType: z.string().min(1),
    id: z.string().min(1).optional(),
    meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

const fhirBundleSchema = z
  .object({
    resourceType: z.literal("Bundle"),
    type: z.string().optional(),
    entry: z
      .array(
        z
          .object({
            resource: fhirResourceSchema.optional(),
            fullUrl: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

function toStored(
  organizationId: string,
  resource: FhirResource,
  now: () => Date,
): StoredResource {
  const versionId =
    (typeof resource.meta?.versionId === "string" && resource.meta.versionId) || "1";
  const lastUpdated =
    (typeof resource.meta?.lastUpdated === "string" && resource.meta.lastUpdated) ||
    now().toISOString();
  return {
    organizationId,
    resourceType: resource.resourceType,
    resourceId: resource.id as string,
    versionId,
    lastUpdated,
    body: resource,
  };
}

export interface PersistBundleOptions {
  /** Defaults to the Postgres-backed PrismaFhirResourceStore. */
  store?: FhirResourceStore;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
}

/**
 * Validate and persist every resource in a FHIR Bundle, scoped to one
 * organization. Entries with no resource or no `id` are skipped (with a
 * reason) rather than failing the whole bundle; a structurally invalid Bundle
 * throws.
 */
export async function persistFhirBundle(
  organizationId: string,
  bundle: unknown,
  opts: PersistBundleOptions = {},
): Promise<BundlePersistResult> {
  if (!organizationId) {
    throw new Error("organizationId is required");
  }
  const store = opts.store ?? new PrismaFhirResourceStore();
  const now = opts.now ?? (() => new Date());

  const parsed = fhirBundleSchema.safeParse(bundle);
  if (!parsed.success) {
    throw new Error(
      `invalid FHIR Bundle: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  const validBundle = parsed.data as FhirBundle;
  const entries = validBundle.entry ?? [];
  const skipped: Array<{ index: number; reason: string }> = [];
  let stored = 0;

  for (let i = 0; i < entries.length; i++) {
    const resource = entries[i]?.resource;
    if (!resource) {
      skipped.push({ index: i, reason: "entry missing resource" });
      continue;
    }
    if (!resource.id) {
      skipped.push({ index: i, reason: `${resource.resourceType} missing id` });
      continue;
    }
    await store.put(toStored(organizationId, resource, now));
    stored += 1;
  }

  return {
    organizationId,
    bundleSize: entries.length,
    storedCount: stored,
    skippedCount: skipped.length,
    skipped,
  };
}

/** Read a single persisted resource (defaults to the Postgres store). */
export async function getStoredResource(
  organizationId: string,
  resourceType: string,
  resourceId: string,
  store: FhirResourceStore = new PrismaFhirResourceStore(),
): Promise<StoredResource | null> {
  return store.get(organizationId, resourceType, resourceId);
}

/** List persisted resources of a type for an organization. */
export async function listStoredByType(
  organizationId: string,
  resourceType: string,
  store: FhirResourceStore = new PrismaFhirResourceStore(),
): Promise<ReadonlyArray<StoredResource>> {
  return store.listByType(organizationId, resourceType);
}
