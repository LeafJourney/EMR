import type { StoredResource } from "./types";

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

export class InMemoryFhirResourceStore implements FhirResourceStore {
  private rows = new Map<string, StoredResource>();

  private key(org: string, type: string, id: string): string {
    return `${org}::${type}::${id}`;
  }

  async put(resource: StoredResource): Promise<void> {
    this.rows.set(
      this.key(resource.organizationId, resource.resourceType, resource.resourceId),
      resource,
    );
  }

  async get(
    organizationId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<StoredResource | null> {
    return this.rows.get(this.key(organizationId, resourceType, resourceId)) ?? null;
  }

  async listByType(
    organizationId: string,
    resourceType: string,
  ): Promise<ReadonlyArray<StoredResource>> {
    const out: StoredResource[] = [];
    for (const row of this.rows.values()) {
      if (row.organizationId === organizationId && row.resourceType === resourceType) {
        out.push(row);
      }
    }
    return out;
  }

  size(): number {
    return this.rows.size;
  }
}
