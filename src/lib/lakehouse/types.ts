/**
 * LeafBridge Lakehouse — engine types.
 *
 * This is the app-side realization of the lakehouse zones documented in
 * `leafbridge/docs/architecture/lakehouse-zones.md` (Bronze → Silver → Gold →
 * Platinum → Vector → Audit). It is **pure TypeScript** — no Prisma, no Next,
 * no Clerk — so it can run inside a Next route handler, a worker, a CLI, or a
 * unit test, exactly like the framework-free `leafbridge/fhir-persistence`
 * contract it mirrors.
 *
 * The engine stores canonical FHIR R4 JSON (the Gold zone), keeps an immutable
 * version history per resource, derives a flat search index, emits a
 * hash-chained audit event for every state change (the Audit zone), and rolls
 * the whole thing up into a queryable catalog that the UX renders.
 */

/** A loose FHIR R4 resource — `resourceType` is the only guaranteed field. */
export interface FhirJson {
  resourceType: string;
  id?: string;
  meta?: {
    versionId?: string;
    lastUpdated?: string;
    profile?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** The six logical lakehouse zones (see lakehouse-zones.md). */
export type Zone = "bronze" | "silver" | "gold" | "platinum" | "vector" | "audit";

/**
 * Where a resource came from — the provenance breadcrumb that lets the UX
 * trace a Gold-zone resource all the way back to its raw Bronze artifact.
 */
export interface SourceProvenance {
  /** Source system label, e.g. "Northbay EHR", "Riverside Lab", "intake-form". */
  system: string;
  /** Wire format of the inbound artifact. */
  format: "fhir-r4" | "hl7v2" | "ccda" | "pdf" | "csv" | "internal";
  /** Opaque pointer to the Bronze artifact (e.g. an s3:// URL or a row id). */
  artifactRef?: string;
  /** When the artifact was ingested. */
  ingestedAt: string;
}

/**
 * A single stored version of a resource. Versions are immutable; updating a
 * resource appends a new `StoredResource` with an incremented `versionId` and
 * leaves the prior versions intact (Iceberg-style snapshot history).
 */
export interface StoredResource {
  tenantId: string;
  resourceType: string;
  resourceId: string;
  /** Monotonic version, "1", "2", … (FHIR `meta.versionId`). */
  versionId: string;
  /** ISO-8601 instant of this version (FHIR `meta.lastUpdated`). */
  lastUpdated: string;
  /** True when this version is a logical delete (tombstone). */
  deleted?: boolean;
  /** The canonical FHIR R4 JSON for this version. */
  body: FhirJson;
  /** Where this version came from. */
  provenance: SourceProvenance;
}

/** The kind of value a search parameter matches against. */
export type SearchParamType = "string" | "token" | "date" | "reference" | "number";

/** Outcome of validating one resource against US-Core-ish expectations. */
export type Conformance = "pass" | "warn" | "error";

/**
 * One extracted, indexable search value. A resource flattens into many of
 * these (e.g. Patient → name=jane, gender=female, birthdate=1980-05-01).
 */
export interface SearchToken {
  /** Search parameter name, e.g. "name", "code", "patient", "date". */
  name: string;
  type: SearchParamType;
  /** Lower-cased value for string/token; raw for date/number/reference. */
  value: string;
  /** For token params: the coding system, when present. */
  system?: string;
}

/** A parsed `?name=value` (or `name:modifier=value`) query argument. */
export interface SearchArg {
  name: string;
  modifier?: string;
  value: string;
}

/** A FHIR Bundle (searchset / history / collection). */
export interface FhirBundle {
  resourceType: "Bundle";
  type: "searchset" | "history" | "collection" | "batch-response";
  total?: number;
  link?: Array<{ relation: string; url: string }>;
  entry?: Array<{
    fullUrl?: string;
    resource: FhirJson;
    search?: { mode: "match" | "include" | "outcome" };
    request?: { method: string; url: string };
    response?: { status: string; etag?: string; lastModified?: string };
  }>;
}

/** A hash-chained audit event (the append-only Audit zone). */
export interface AuditEntry {
  tenantId: string;
  /** Monotonic sequence within the tenant chain, starting at 1. */
  seq: number;
  auditId: string;
  recordedAt: string;
  /** FHIR-AuditEvent-ish action: C/R/U/D/E (execute). */
  action: "C" | "R" | "U" | "D" | "E";
  /** Short type code, e.g. "rest", "ingest", "search". */
  typeCode: string;
  outcome: "0" | "4" | "8"; // success / minor failure / serious failure
  agentType: string;
  agentId: string;
  resourceType?: string;
  resourceId?: string;
  versionId?: string;
  patientId?: string;
  description?: string;
  /** Hash of the previous entry in this tenant's chain ("0"×16 for genesis). */
  prevHash: string;
  /** Hash of this entry (covers prevHash → tamper-evident chain). */
  rowHash: string;
}

/** Per-resource-type rollup the catalog surfaces to the UX. */
export interface ResourceTypeStat {
  resourceType: string;
  /** Distinct live (non-deleted) resources. */
  count: number;
  /** Total stored versions across all resources of this type. */
  versions: number;
  /** Most recent `lastUpdated` across this type, or null when empty. */
  lastUpdated: string | null;
  /** Conformance tally across live resources. */
  conformance: { pass: number; warn: number; error: number };
  /** Mean mapping confidence (0..1) across live resources. */
  meanConfidence: number;
  /** Distinct source systems contributing this type. */
  sources: string[];
}

/** A zone's rollup for the zone catalog. */
export interface ZoneStat {
  zone: Zone;
  /** Human label, e.g. "Gold — canonical FHIR". */
  label: string;
  /** Row/object count materialized in this zone. */
  rows: number;
  /** Iceberg-style catalog name, e.g. "leafbridge_gold". */
  catalog: string;
  description: string;
}

/** The full catalog snapshot powering the Lakehouse Console. */
export interface LakehouseCatalog {
  tenantId: string;
  generatedAt: string;
  zones: ZoneStat[];
  resourceTypes: ResourceTypeStat[];
  totals: {
    resources: number;
    versions: number;
    auditEvents: number;
    patients: number;
    /** Overall conformance across every live resource. */
    conformance: { pass: number; warn: number; error: number };
  };
}
