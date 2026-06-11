/**
 * LeafBridge Lakehouse — the storage + query engine.
 *
 * An in-memory realization of the lakehouse zones. It is the single object the
 * app builds (materialized from the FHIR mappers) and the UX queries. The
 * contract is identical to what a Prisma- or Iceberg-backed store would expose,
 * so swapping the in-memory map for a durable store later is a drop-in.
 *
 * Responsibilities:
 *   • Gold zone     — canonical FHIR JSON, one row per resource version.
 *   • Versioning    — immutable history; updates append a new versionId.
 *   • Search index  — flat tokens derived per current version.
 *   • Conformance   — US-Core score + mapping confidence per current version.
 *   • Audit zone    — a hash-chained AuditEntry per state change.
 *   • Catalog       — zone + resource-type rollups for the console.
 */
import { AuditLog } from "./audit";
import { scoreConformance, type ConformanceResult } from "./conformance";
import {
  extractSearchTokens,
  paramsForType,
  tokenSetMatchesArg,
} from "./search-params";
import type {
  FhirJson,
  LakehouseCatalog,
  ResourceTypeStat,
  SearchArg,
  SearchToken,
  SourceProvenance,
  StoredResource,
  Zone,
  ZoneStat,
} from "./types";

/** Internal per-resource cell: the version stack + derived indexes. */
interface Cell {
  versions: StoredResource[]; // oldest first
  tokens: SearchToken[]; // for the current version
  conformance: ConformanceResult; // for the current version
}

export interface SearchOptions {
  count?: number;
  offset?: number;
  /** Sort by this search param ("-name" for descending). Defaults to _lastUpdated desc. */
  sort?: string;
}

export interface SearchResult {
  matches: FhirJson[];
  total: number;
}

const ZONE_META: Record<Zone, { label: string; catalog: string; description: string }> = {
  bronze: { label: "Bronze — raw", catalog: "leafbridge_bronze", description: "Source artifacts exactly as received. Immutable." },
  silver: { label: "Silver — parsed", catalog: "leafbridge_silver", description: "Per-source parse shapes before normalization." },
  gold: { label: "Gold — canonical FHIR", catalog: "leafbridge_gold", description: "Canonical FHIR R4. The truth every other zone derives from." },
  platinum: { label: "Platinum — clinical marts", catalog: "leafbridge_platinum", description: "Materialized analytics views computed off Gold." },
  vector: { label: "Vector — AI retrieval", catalog: "leafbridge_vector", description: "Embeddings mirrored from Gold for RAG." },
  audit: { label: "Audit — append-only", catalog: "leafbridge_audit", description: "Hash-chained, tamper-evident event ledger." },
};

export class LakehouseEngine {
  private readonly cells = new Map<string, Cell>();
  private readonly audit: AuditLog;
  private readonly now: () => Date;
  /** Bronze artifact count — one per ingested resource version. */
  private bronzeRows = 0;

  constructor(opts: { now?: () => Date } = {}) {
    this.now = opts.now ?? (() => new Date());
    this.audit = new AuditLog(this.now);
  }

  get auditLog(): AuditLog {
    return this.audit;
  }

  private key(tenantId: string, type: string, id: string): string {
    return `${tenantId}::${type}::${id}`;
  }

  // -------------------------------------------------------------------------
  // Write path
  // -------------------------------------------------------------------------

  /**
   * Upsert a resource. If a resource with the same (type,id) exists and the
   * incoming body differs, a new immutable version is appended; an identical
   * body is a no-op that still records a read-through. Returns the stored
   * current version.
   */
  ingest(
    tenantId: string,
    resource: FhirJson,
    provenance: SourceProvenance,
  ): StoredResource {
    if (!resource?.resourceType) throw new Error("resource.resourceType is required");
    const id = resource.id;
    if (!id) throw new Error(`${resource.resourceType} is missing id`);

    const key = this.key(tenantId, resource.resourceType, id);
    const existing = this.cells.get(key);
    const nextVersion = existing ? String(existing.versions.length + 1) : "1";
    const lastUpdated = resource.meta?.lastUpdated ?? this.now().toISOString();

    // Stamp meta.versionId / lastUpdated so the body is self-describing.
    const body: FhirJson = {
      ...resource,
      meta: { ...(resource.meta ?? {}), versionId: nextVersion, lastUpdated },
    };

    const stored: StoredResource = {
      tenantId,
      resourceType: resource.resourceType,
      resourceId: id,
      versionId: nextVersion,
      lastUpdated,
      body,
      provenance,
    };

    const versions = existing ? [...existing.versions, stored] : [stored];
    this.cells.set(key, {
      versions,
      tokens: extractSearchTokens(body),
      conformance: scoreConformance(body),
    });
    this.bronzeRows += 1;

    this.audit.append(tenantId, {
      action: existing ? "U" : "C",
      typeCode: "ingest",
      agentType: "system",
      agentId: provenance.system,
      resourceType: resource.resourceType,
      resourceId: id,
      versionId: nextVersion,
      patientId: this.patientCompartmentId(body),
      description: `${existing ? "Updated" : "Created"} ${resource.resourceType}/${id} v${nextVersion} from ${provenance.system}`,
    });

    return stored;
  }

  /** Ingest every resource in a Bundle. Returns a per-entry result summary. */
  ingestBundle(
    tenantId: string,
    bundle: { entry?: Array<{ resource?: FhirJson }> },
    provenance: SourceProvenance,
  ): { stored: number; skipped: Array<{ index: number; reason: string }> } {
    const entries = bundle.entry ?? [];
    const skipped: Array<{ index: number; reason: string }> = [];
    let stored = 0;
    entries.forEach((e, i) => {
      const r = e.resource;
      if (!r?.resourceType) return skipped.push({ index: i, reason: "entry missing resource" });
      if (!r.id) return skipped.push({ index: i, reason: `${r.resourceType} missing id` });
      this.ingest(tenantId, r, provenance);
      stored += 1;
    });
    return { stored, skipped };
  }

  /** Logical delete (tombstone) — appends a deleted version + audit event. */
  remove(tenantId: string, type: string, id: string, agentId = "system"): boolean {
    const cell = this.cells.get(this.key(tenantId, type, id));
    if (!cell) return false;
    const current = cell.versions[cell.versions.length - 1];
    if (current.deleted) return false;
    const versionId = String(cell.versions.length + 1);
    const lastUpdated = this.now().toISOString();
    const tombstone: StoredResource = {
      ...current,
      versionId,
      lastUpdated,
      deleted: true,
      body: { ...current.body, meta: { ...current.body.meta, versionId, lastUpdated } },
    };
    cell.versions.push(tombstone);
    this.audit.append(tenantId, {
      action: "D",
      typeCode: "rest",
      agentType: "user",
      agentId,
      resourceType: type,
      resourceId: id,
      versionId,
      description: `Deleted ${type}/${id}`,
    });
    return true;
  }

  // -------------------------------------------------------------------------
  // Read path
  // -------------------------------------------------------------------------

  /** Current (non-deleted) version of a resource, or null. */
  read(tenantId: string, type: string, id: string): FhirJson | null {
    const cell = this.cells.get(this.key(tenantId, type, id));
    if (!cell) return null;
    const current = cell.versions[cell.versions.length - 1];
    return current.deleted ? null : current.body;
  }

  /** A specific historical version of a resource, or null. */
  vread(tenantId: string, type: string, id: string, versionId: string): FhirJson | null {
    const cell = this.cells.get(this.key(tenantId, type, id));
    return cell?.versions.find((v) => v.versionId === versionId)?.body ?? null;
  }

  /** Full version history, newest first. */
  history(tenantId: string, type: string, id: string): StoredResource[] {
    const cell = this.cells.get(this.key(tenantId, type, id));
    return cell ? [...cell.versions].reverse() : [];
  }

  /** Conformance result for a resource's current version. */
  conformanceOf(tenantId: string, type: string, id: string): ConformanceResult | null {
    return this.cells.get(this.key(tenantId, type, id))?.conformance ?? null;
  }

  /** Provenance for a resource's current version. */
  provenanceOf(tenantId: string, type: string, id: string): SourceProvenance | null {
    const cell = this.cells.get(this.key(tenantId, type, id));
    return cell ? cell.versions[cell.versions.length - 1].provenance : null;
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /** Live (non-deleted) cells for a tenant, optionally filtered by type. */
  private liveCells(tenantId: string, type?: string): Cell[] {
    const out: Cell[] = [];
    for (const cell of this.cells.values()) {
      const cur = cell.versions[cell.versions.length - 1];
      if (cur.tenantId !== tenantId || cur.deleted) continue;
      if (type && cur.resourceType !== type) continue;
      out.push(cell);
    }
    return out;
  }

  /** Search a resource type with AND-combined args, paginated + sorted. */
  search(
    tenantId: string,
    type: string,
    args: SearchArg[],
    opts: SearchOptions = {},
  ): SearchResult {
    const matched = this.liveCells(tenantId, type).filter((cell) =>
      args.every((arg) => tokenSetMatchesArg(type, arg, cell.tokens)),
    );

    // Sort: default newest-first by lastUpdated; else by the named token.
    const sortKey = opts.sort?.replace(/^-/, "");
    const desc = opts.sort ? opts.sort.startsWith("-") : true;
    matched.sort((a, b) => {
      const av = sortKey ? (a.tokens.find((t) => t.name === sortKey)?.value ?? "") : a.versions[a.versions.length - 1].lastUpdated;
      const bv = sortKey ? (b.tokens.find((t) => t.name === sortKey)?.value ?? "") : b.versions[b.versions.length - 1].lastUpdated;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return desc ? -cmp : cmp;
    });

    const total = matched.length;
    const offset = Math.max(0, opts.offset ?? 0);
    const count = opts.count ?? 50;
    const page = matched.slice(offset, offset + count);
    return { matches: page.map((c) => c.versions[c.versions.length - 1].body), total };
  }

  // -------------------------------------------------------------------------
  // Patient compartment ($everything)
  // -------------------------------------------------------------------------

  /** The patient id a resource belongs to (its compartment), if any. */
  private patientCompartmentId(body: FhirJson): string | undefined {
    if (body.resourceType === "Patient") return body.id;
    const ref =
      (body.subject as { reference?: string } | undefined)?.reference ??
      (body.patient as { reference?: string } | undefined)?.reference;
    if (typeof ref === "string" && ref.toLowerCase().includes("patient/")) {
      return ref.slice(ref.lastIndexOf("/") + 1);
    }
    return undefined;
  }

  /** Every live resource in a patient's compartment, the Patient first. */
  everything(tenantId: string, patientId: string): FhirJson[] {
    const out: FhirJson[] = [];
    const patient = this.read(tenantId, "Patient", patientId);
    if (patient) out.push(patient);
    for (const cell of this.liveCells(tenantId)) {
      const cur = cell.versions[cell.versions.length - 1];
      if (cur.resourceType === "Patient") continue;
      if (this.patientCompartmentId(cur.body) === patientId) out.push(cur.body);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Catalog + capability
  // -------------------------------------------------------------------------

  /** Distinct resource types present, sorted. */
  resourceTypes(tenantId: string): string[] {
    const types = new Set<string>();
    for (const cell of this.liveCells(tenantId)) {
      types.add(cell.versions[cell.versions.length - 1].resourceType);
    }
    return [...types].sort();
  }

  /** Full catalog snapshot for the Lakehouse Console. */
  catalog(tenantId: string): LakehouseCatalog {
    const live = this.liveCells(tenantId);
    const byType = new Map<string, Cell[]>();
    for (const cell of live) {
      const t = cell.versions[cell.versions.length - 1].resourceType;
      (byType.get(t) ?? byType.set(t, []).get(t)!).push(cell);
    }

    const resourceTypes: ResourceTypeStat[] = [];
    const overall = { pass: 0, warn: 0, error: 0 };
    let totalVersions = 0;
    let totalResources = 0;

    for (const [resourceType, cells] of [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const conformance = { pass: 0, warn: 0, error: 0 };
      const sources = new Set<string>();
      let confSum = 0;
      let versions = 0;
      let lastUpdated: string | null = null;
      for (const cell of cells) {
        const cur = cell.versions[cell.versions.length - 1];
        conformance[cell.conformance.state] += 1;
        overall[cell.conformance.state] += 1;
        confSum += cell.conformance.confidence;
        versions += cell.versions.length;
        sources.add(cur.provenance.system);
        if (!lastUpdated || cur.lastUpdated > lastUpdated) lastUpdated = cur.lastUpdated;
      }
      totalVersions += versions;
      totalResources += cells.length;
      resourceTypes.push({
        resourceType,
        count: cells.length,
        versions,
        lastUpdated,
        conformance,
        meanConfidence: cells.length ? confSum / cells.length : 0,
        sources: [...sources].sort(),
      });
    }

    const patients = byType.get("Patient")?.length ?? 0;
    const auditEvents = this.audit.list(tenantId).length;

    const zones: ZoneStat[] = (Object.keys(ZONE_META) as Zone[]).map((zone) => ({
      zone,
      label: ZONE_META[zone].label,
      catalog: ZONE_META[zone].catalog,
      description: ZONE_META[zone].description,
      rows: this.zoneRows(zone, { bronze: this.bronzeRows, gold: totalResources, audit: auditEvents, platinum: resourceTypes.length }),
    }));

    return {
      tenantId,
      generatedAt: this.now().toISOString(),
      zones,
      resourceTypes,
      totals: {
        resources: totalResources,
        versions: totalVersions,
        auditEvents,
        patients,
        conformance: overall,
      },
    };
  }

  private zoneRows(zone: Zone, counts: { bronze: number; gold: number; audit: number; platinum: number }): number {
    switch (zone) {
      case "bronze": return counts.bronze;
      case "silver": return counts.bronze; // one parse shape per raw artifact
      case "gold": return counts.gold;
      case "platinum": return counts.platinum; // one mart row per materialized type rollup
      case "vector": return counts.gold; // mirrored 1:1 from Gold
      case "audit": return counts.audit;
      default: return 0;
    }
  }

  /** A minimal CapabilityStatement reflecting what the engine actually serves. */
  capabilityStatement(tenantId: string): FhirJson {
    const resource = this.resourceTypes(tenantId).map((type) => ({
      type,
      interaction: [
        { code: "read" },
        { code: "vread" },
        { code: "search-type" },
        { code: "history-instance" },
      ],
      searchParam: paramsForType(type).map((p) => ({ name: p.name, type: p.type, documentation: p.doc })),
    }));
    return {
      resourceType: "CapabilityStatement",
      id: `leafbridge-${tenantId}`,
      status: "active",
      date: this.now().toISOString(),
      kind: "instance",
      fhirVersion: "4.0.1",
      format: ["json"],
      rest: [
        {
          mode: "server",
          documentation: "LeafBridge Lakehouse Gold-zone FHIR R4 query surface.",
          resource,
          operation: [{ name: "everything", definition: "Patient/$everything" }],
        },
      ],
    };
  }
}
