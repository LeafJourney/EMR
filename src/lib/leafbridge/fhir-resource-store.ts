/**
 * LeafBridge — FhirResourceStore implementations.
 *
 * `PrismaFhirResourceStore` is the Postgres adapter that "wires the spine"
 * (Phase 1): it backs the LeafBridge `FhirResourceStore` interface with the
 * `StoredResource` Prisma model, replacing the in-memory store the LeafBridge
 * services ship with. `InMemoryFhirResourceStore` mirrors the LeafBridge dev/
 * test store so the persistence logic can be exercised without a database.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { FhirResource, FhirResourceStore, StoredResource } from "./types";

interface StoredResourceRow {
  organizationId: string;
  resourceType: string;
  resourceId: string;
  versionId: string;
  lastUpdated: Date;
  body: Prisma.JsonValue;
}

/** Map a persisted DB row back into the LeafBridge `StoredResource` shape. */
function rowToStored(row: StoredResourceRow): StoredResource {
  return {
    organizationId: row.organizationId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    versionId: row.versionId,
    lastUpdated: row.lastUpdated.toISOString(),
    body: row.body as unknown as FhirResource,
  };
}

export class PrismaFhirResourceStore implements FhirResourceStore {
  async put(resource: StoredResource): Promise<void> {
    const body = resource.body as unknown as Prisma.InputJsonValue;
    await prisma.storedResource.upsert({
      where: {
        organizationId_resourceType_resourceId: {
          organizationId: resource.organizationId,
          resourceType: resource.resourceType,
          resourceId: resource.resourceId,
        },
      },
      create: {
        organizationId: resource.organizationId,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        versionId: resource.versionId,
        lastUpdated: new Date(resource.lastUpdated),
        body,
      },
      update: {
        versionId: resource.versionId,
        lastUpdated: new Date(resource.lastUpdated),
        body,
      },
    });
  }

  async get(
    organizationId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<StoredResource | null> {
    const row = await prisma.storedResource.findUnique({
      where: {
        organizationId_resourceType_resourceId: {
          organizationId,
          resourceType,
          resourceId,
        },
      },
    });
    return row ? rowToStored(row) : null;
  }

  async listByType(
    organizationId: string,
    resourceType: string,
  ): Promise<ReadonlyArray<StoredResource>> {
    const rows = await prisma.storedResource.findMany({
      where: { organizationId, resourceType },
      orderBy: { lastUpdated: "desc" },
    });
    return rows.map(rowToStored);
  }
}

/**
 * In-memory store — mirrors `leafbridge/fhir-persistence/store.ts`. Used by the
 * persistence test suite and any dev path that wants a database-free spine.
 */
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
