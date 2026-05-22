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

export interface StoredResource {
  organizationId: string;
  resourceType: string;
  resourceId: string;
  versionId: string;
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
