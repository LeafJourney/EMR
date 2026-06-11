/**
 * Leafnerd — Lakehouse data layer.
 *
 * Materializes the demo tenant's FHIR resources into a live {@link
 * LakehouseEngine} and exposes query helpers for the Lakehouse Console + FHIR
 * query API. The engine is the app-side realization of the LeafBridge zones
 * (Bronze → Gold → Audit); this module is the thin seam that fills it with real
 * data and answers questions about it.
 *
 * Resilience mirrors the rest of the leafnerd server layer: every public helper
 * is wrapped so a blown-up DB never crashes a render. The resource set is the
 * union of (a) genuinely-mapped rows from the seeded `leafnerd-demo` org (via
 * the production FHIR mappers) and (b) the curated analytics resources — so the
 * lakehouse is populated even before the demo DB is reachable.
 *
 * The materialized engine is memoized briefly (process-local) so a burst of
 * console/API calls shares one stable snapshot (and one stable audit chain)
 * instead of rebuilding per request.
 */
import "server-only";
import { LakehouseEngine, parseSearchArgs } from "@/lib/lakehouse";
import type {
  AuditEntry,
  FhirJson,
  LakehouseCatalog,
  SourceProvenance,
  StoredResource,
} from "@/lib/lakehouse";
import { DEMO_DATA } from "@/lib/leafnerd/analytics";
import { getRealFhirResources } from "@/lib/leafnerd/fhir-real";
import type { FhirResource } from "@/lib/leafnerd/types";

export const LAKEHOUSE_TENANT = "leafnerd-demo";

const MEMO_TTL_MS = 30_000;
let memo: { at: number; engine: LakehouseEngine } | null = null;

/** Infer the inbound wire format from a provenance breadcrumb's free text. */
function inferFormat(text: string | undefined): SourceProvenance["format"] {
  const t = (text ?? "").toLowerCase();
  if (t.includes("hl7v2") || t.includes("oru") || t.includes("adt")) return "hl7v2";
  if (t.includes("ccda") || t.includes("c-cda")) return "ccda";
  if (t.includes("fhir")) return "fhir-r4";
  if (t.includes("claim") || t.includes("837") || t.includes("835")) return "csv";
  if (t.includes("intake") || t.includes("portal")) return "internal";
  return "fhir-r4";
}

/** Build the provenance record for a curated/real FhirResource. */
function provenanceOf(r: FhirResource): SourceProvenance {
  const recorded = r.provenance.find((p) => /recorded/i.test(p.t))?.m ?? r.provenance[0]?.m ?? "Leafnerd pipeline";
  const system = recorded.split("·")[0].trim() || "Leafnerd pipeline";
  const lastUpdated =
    (r.json?.meta as { lastUpdated?: string } | undefined)?.lastUpdated ??
    (r.date ? `${r.date}T00:00:00.000Z` : new Date().toISOString());
  return {
    system,
    format: inferFormat(recorded),
    artifactRef: `s3://leafbridge-bronze/${LAKEHOUSE_TENANT}/${r.type}/${r.id}.json`,
    ingestedAt: lastUpdated,
  };
}

/** Ensure a raw R4 body has the id/resourceType the engine requires. */
function normalizeBody(r: FhirResource): FhirJson | null {
  const json = r.json as FhirJson | undefined;
  if (!json || typeof json !== "object") return null;
  const resourceType = typeof json.resourceType === "string" ? json.resourceType : r.type;
  const id = typeof json.id === "string" ? json.id : r.id;
  if (!resourceType || !id) return null;
  return { ...json, resourceType, id };
}

/** Collect the demo resource set: real (genuinely-mapped) first, then curated. */
async function collectResources(): Promise<FhirResource[]> {
  let real: FhirResource[] = [];
  try {
    real = await getRealFhirResources();
  } catch {
    real = [];
  }
  const curated = DEMO_DATA.fhirResources;
  // De-dupe by type+id so a real row supersedes its curated twin.
  const seen = new Set<string>();
  const out: FhirResource[] = [];
  for (const r of [...real, ...curated]) {
    const key = `${r.type}:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Build (and memoize) the materialized lakehouse engine for the demo tenant. */
export async function getLakehouse(): Promise<LakehouseEngine> {
  if (memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.engine;

  const engine = new LakehouseEngine();
  try {
    const resources = await collectResources();
    // Ingest patients first so compartment + reference resolution is coherent.
    const ordered = [...resources].sort((a, b) => (a.type === "Patient" ? -1 : 0) - (b.type === "Patient" ? -1 : 0));
    for (const r of ordered) {
      const body = normalizeBody(r);
      if (!body) continue;
      try {
        engine.ingest(LAKEHOUSE_TENANT, body, provenanceOf(r));
      } catch {
        /* skip a single bad resource; never fail the whole build */
      }
    }
  } catch {
    /* an empty engine is still a valid (empty) lakehouse */
  }

  memo = { at: Date.now(), engine };
  return engine;
}

/** Drop the memoized engine — used after a write so the next read is fresh. */
export function invalidateLakehouse(): void {
  memo = null;
}

// ---------------------------------------------------------------------------
// Query helpers (each resilient; never throw).
// ---------------------------------------------------------------------------

export async function getLakehouseCatalog(): Promise<LakehouseCatalog | null> {
  try {
    return (await getLakehouse()).catalog(LAKEHOUSE_TENANT);
  } catch {
    return null;
  }
}

export interface LakehouseSearchResponse {
  total: number;
  resources: FhirJson[];
}

export async function searchLakehouse(
  resourceType: string,
  query: Record<string, string | string[] | undefined>,
  opts: { count?: number; offset?: number; sort?: string } = {},
): Promise<LakehouseSearchResponse> {
  try {
    const engine = await getLakehouse();
    const args = parseSearchArgs(query);
    const { matches, total } = engine.search(LAKEHOUSE_TENANT, resourceType, args, opts);
    return { total, resources: matches };
  } catch {
    return { total: 0, resources: [] };
  }
}

export async function readLakehouseResource(resourceType: string, id: string): Promise<FhirJson | null> {
  try {
    return (await getLakehouse()).read(LAKEHOUSE_TENANT, resourceType, id);
  } catch {
    return null;
  }
}

export async function historyOfResource(resourceType: string, id: string): Promise<StoredResource[]> {
  try {
    return (await getLakehouse()).history(LAKEHOUSE_TENANT, resourceType, id);
  } catch {
    return [];
  }
}

export async function everythingForPatient(patientId: string): Promise<FhirJson[]> {
  try {
    return (await getLakehouse()).everything(LAKEHOUSE_TENANT, patientId);
  } catch {
    return [];
  }
}

export async function getCapabilityStatement(): Promise<FhirJson | null> {
  try {
    return (await getLakehouse()).capabilityStatement(LAKEHOUSE_TENANT);
  } catch {
    return null;
  }
}

export async function getAuditTail(limit = 25): Promise<{ entries: AuditEntry[]; verified: boolean; total: number }> {
  try {
    const engine = await getLakehouse();
    const all = engine.auditLog.list(LAKEHOUSE_TENANT);
    const verify = engine.auditLog.verify(LAKEHOUSE_TENANT);
    return {
      entries: [...all].slice(-limit).reverse(),
      verified: verify.ok,
      total: all.length,
    };
  } catch {
    return { entries: [], verified: false, total: 0 };
  }
}
