import { fhirBundleSchema } from "./schemas";
import type { FhirResourceStore } from "./store";
import type {
  BundlePersistResult,
  FhirBundle,
  FhirResource,
  StoredResource,
} from "./types";

export interface FhirPersistenceOptions {
  store: FhirResourceStore;
  now?: () => Date;
}

export class FhirPersistenceService {
  private readonly store: FhirResourceStore;
  private readonly now: () => Date;

  constructor(opts: FhirPersistenceOptions) {
    this.store = opts.store;
    this.now = opts.now ?? (() => new Date());
  }

  async persistBundle(
    organizationId: string,
    bundle: unknown,
  ): Promise<BundlePersistResult> {
    if (!organizationId) {
      throw new Error("organizationId is required");
    }
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
      const entry = entries[i];
      const resource = entry?.resource;
      if (!resource) {
        skipped.push({ index: i, reason: "entry missing resource" });
        continue;
      }
      if (!resource.id) {
        skipped.push({ index: i, reason: `${resource.resourceType} missing id` });
        continue;
      }
      const row = this.toStored(organizationId, resource);
      await this.store.put(row);
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

  async getResource(
    organizationId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<StoredResource | null> {
    return this.store.get(organizationId, resourceType, resourceId);
  }

  async listByType(
    organizationId: string,
    resourceType: string,
  ): Promise<ReadonlyArray<StoredResource>> {
    return this.store.listByType(organizationId, resourceType);
  }

  private toStored(
    organizationId: string,
    resource: FhirResource,
  ): StoredResource {
    const versionId =
      (typeof resource.meta?.versionId === "string" && resource.meta.versionId) ||
      "1";
    const lastUpdated =
      (typeof resource.meta?.lastUpdated === "string" && resource.meta.lastUpdated) ||
      this.now().toISOString();
    return {
      organizationId,
      resourceType: resource.resourceType,
      resourceId: resource.id as string,
      versionId,
      lastUpdated,
      body: resource,
    };
  }
}
