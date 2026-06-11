"use client";
/**
 * Lakehouse Console — interactive FHIR query playground.
 *
 * Drives the read-only `/api/leafnerd/fhir` surface: pick a resource type,
 * fill in the indexed search parameters (self-described from the engine's
 * registry), and run a live search. Click a result to read it, walk its
 * version history, or pull its whole `$everything` compartment — each rendered
 * as the raw R4 JSON the engine actually returns. The point is to make the
 * lakehouse *usable* and *learnable*: every panel shows the request URL it ran.
 */
import { useCallback, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ParamDef {
  name: string;
  type: string;
  doc: string;
}

interface Props {
  resourceTypes: string[];
  searchParams: Record<string, ParamDef[]>;
  /** Common params present on every type (rendered as hints). */
  commonParams: ParamDef[];
}

interface BundleEntry {
  resource: { resourceType?: string; id?: string; [k: string]: unknown };
}
interface Bundle {
  resourceType: string;
  total?: number;
  entry?: BundleEntry[];
}

const API = "/api/leafnerd/fhir";

function buildUrl(type: string, filters: Record<string, string>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v.trim()) usp.set(k, v.trim());
  usp.set("_count", "25");
  const qs = usp.toString();
  return `${API}/${type}${qs ? `?${qs}` : ""}`;
}

function shortLabel(r: BundleEntry["resource"]): string {
  const rt = r.resourceType ?? "Resource";
  const name = Array.isArray(r.name) ? (r.name[0] as { family?: string; given?: string[] } | undefined) : undefined;
  if (name) return `${(name.given ?? []).join(" ")} ${name.family ?? ""}`.trim() || `${rt}/${r.id}`;
  const code = (r.code as { text?: string; coding?: Array<{ display?: string; code?: string }> } | undefined);
  if (code?.text) return code.text;
  if (code?.coding?.[0]) return code.coding[0].display ?? code.coding[0].code ?? `${rt}/${r.id}`;
  return `${rt}/${r.id}`;
}

export default function FhirQueryPlayground({ resourceTypes, searchParams, commonParams }: Props) {
  const [type, setType] = useState(resourceTypes[0] ?? "Patient");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [ranUrl, setRanUrl] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ title: string; url: string; body: unknown } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => searchParams[type] ?? [], [searchParams, type]);

  const onType = (t: string) => {
    setType(t);
    setFilters({});
    setBundle(null);
    setRanUrl(null);
    setDetail(null);
    setError(null);
  };

  const run = useCallback(async () => {
    const url = buildUrl(type, filters);
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      const res = await fetch(url, { headers: { Accept: "application/fhir+json" } });
      const data = (await res.json()) as Bundle;
      setBundle(data);
      setRanUrl(url);
    } catch {
      setError("Query failed — is the dev server running?");
    } finally {
      setLoading(false);
    }
  }, [type, filters]);

  const openDetail = useCallback(async (title: string, url: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { headers: { Accept: "application/fhir+json" } });
      const body = await res.json();
      setDetail({ title, url, body });
    } catch {
      setError("Failed to load resource.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Resource type tabs */}
      <div className="flex flex-wrap gap-1.5">
        {resourceTypes.map((t) => (
          <button
            key={t}
            onClick={() => onType(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              t === type
                ? "bg-accent text-white border-accent"
                : "bg-surface-muted text-text-muted border-border hover:border-accent/40"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Param inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {params.map((p) => (
          <label key={p.name} className="block">
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-text-subtle mb-1">
              {p.name}
              <span className="text-text-subtle/60">· {p.type}</span>
            </span>
            <input
              value={filters[p.name] ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, [p.name]: e.target.value }))}
              placeholder={p.doc}
              onKeyDown={(e) => e.key === "Enter" && run()}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface focus:border-accent focus:outline-none"
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-subtle">
        <span>Common:</span>
        {commonParams.map((p) => (
          <code key={p.name} className="px-1.5 py-0.5 rounded bg-surface-muted text-text-muted" title={p.doc}>
            {p.name}
          </code>
        ))}
        <span className="ml-1">— date params accept prefixes (ge/le/gt/lt), e.g. <code className="text-text-muted">date=ge2026-01-01</code></span>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={run} disabled={loading}>
          {loading ? "Running…" : `Search ${type}`}
        </Button>
        {ranUrl && <code className="text-[11px] text-text-subtle truncate max-w-[60%]">GET {ranUrl}</code>}
      </div>

      {error && <div className="text-sm text-danger">{error}</div>}

      {/* Results + detail split */}
      {bundle && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card tone="raised">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
                <span className="text-xs font-medium text-text-muted">
                  searchset · {bundle.total ?? bundle.entry?.length ?? 0} match
                  {(bundle.total ?? 0) === 1 ? "" : "es"}
                </span>
                <Badge tone="info">{type}</Badge>
              </div>
              <ul className="divide-y divide-border/50 max-h-[420px] overflow-auto">
                {(bundle.entry ?? []).map((e, i) => {
                  const r = e.resource;
                  const id = String(r.id ?? "");
                  return (
                    <li key={i} className="px-4 py-2.5 hover:bg-surface-muted/50">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          className="text-sm font-medium text-left text-accent hover:underline truncate"
                          onClick={() => openDetail(`${r.resourceType}/${id}`, `${API}/${r.resourceType}/${id}`)}
                        >
                          {shortLabel(r)}
                        </button>
                        <span className="font-mono text-[11px] text-text-subtle shrink-0">{id}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <button
                          className="text-[11px] text-text-subtle hover:text-accent"
                          onClick={() => openDetail(`${r.resourceType}/${id} · _history`, `${API}/${r.resourceType}/${id}/_history`)}
                        >
                          _history
                        </button>
                        {r.resourceType === "Patient" && (
                          <button
                            className="text-[11px] text-text-subtle hover:text-accent"
                            onClick={() => openDetail(`Patient/${id} · $everything`, `${API}/Patient/${id}/$everything`)}
                          >
                            $everything
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
                {(bundle.entry ?? []).length === 0 && (
                  <li className="px-4 py-6 text-sm text-text-subtle text-center">No matches. Try loosening a filter.</li>
                )}
              </ul>
            </CardContent>
          </Card>

          <Card tone="raised">
            <CardContent className="p-0">
              <div className="px-4 py-2.5 border-b border-border/60">
                <span className="text-xs font-medium text-text-muted">
                  {detail ? detail.title : "Select a result to inspect its raw R4 JSON"}
                </span>
              </div>
              {detail ? (
                <div className="p-0">
                  <div className="px-4 pt-2">
                    <code className="text-[11px] text-text-subtle break-all">GET {detail.url}</code>
                  </div>
                  <pre className="px-4 py-3 text-[11px] leading-relaxed font-mono overflow-auto max-h-[400px] text-text-muted">
                    {JSON.stringify(detail.body, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="px-4 py-10 text-sm text-text-subtle text-center">
                  Click a resource, its <code>_history</code>, or a patient&apos;s <code>$everything</code>.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
