import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getAuditTail,
  getCapabilityStatement,
  getLakehouseCatalog,
} from "@/lib/leafnerd/lakehouse-data";
import { SEARCH_PARAMS, paramsForType } from "@/lib/lakehouse";
import type { ResourceTypeStat, ZoneStat } from "@/lib/lakehouse";
import FhirQueryPlayground from "./FhirQueryPlayground";

export const metadata = { title: "Clinical Lakehouse" };
export const dynamic = "force-dynamic";

// The lakehouse zones flow Bronze → Silver → Gold → Platinum → Vector → Audit.
const ZONE_ORDER = ["bronze", "silver", "gold", "platinum", "vector", "audit"] as const;
const ZONE_ACCENT: Record<string, string> = {
  bronze: "#B07B49",
  silver: "#9AA3AD",
  gold: "#C9A227",
  platinum: "#6FA52A",
  vector: "#5B8DEF",
  audit: "#7A6FF0",
};

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function ConformanceBar({ c }: { c: { pass: number; warn: number; error: number } }) {
  const total = c.pass + c.warn + c.error || 1;
  const seg = (v: number, color: string) =>
    v > 0 ? <span style={{ width: `${(v / total) * 100}%`, background: color }} className="h-full inline-block" /> : null;
  return (
    <span className="inline-flex h-1.5 w-24 rounded-full overflow-hidden bg-surface-muted align-middle">
      {seg(c.pass, "var(--success)")}
      {seg(c.warn, "var(--highlight)")}
      {seg(c.error, "var(--danger)")}
    </span>
  );
}

export default async function FhirBridgePage() {
  await requireUser();

  const [catalog, audit, capability] = await Promise.all([
    getLakehouseCatalog(),
    getAuditTail(8),
    getCapabilityStatement(),
  ]);

  const totals = catalog?.totals;
  const conf = totals?.conformance ?? { pass: 0, warn: 0, error: 0 };
  const confTotal = conf.pass + conf.warn + conf.error;
  const zonesByName = new Map<string, ZoneStat>((catalog?.zones ?? []).map((z) => [z.zone, z]));
  const resourceTypes: ResourceTypeStat[] = catalog?.resourceTypes ?? [];

  const commonParams = paramsForType("__none__"); // returns just the common params

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Platform · LeafBridge"
        title="Clinical Lakehouse"
        description="A live, queryable FHIR R4 lakehouse — raw artifacts land in Bronze, normalize to canonical Gold, and every read/write is sealed into a tamper-evident audit chain. Explore it below."
        actions={
          <div className="flex gap-2">
            <Link href="/leafnerd" target="_blank">
              <Button variant="secondary">Open FHIR Explorer</Button>
            </Link>
            <Link href="/api/leafnerd/fhir/metadata" target="_blank">
              <Button variant="ghost">CapabilityStatement</Button>
            </Link>
          </div>
        }
      />

      {/* Totals strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Resources", value: totals?.resources ?? 0, sub: "live · Gold zone" },
          { label: "Versions", value: totals?.versions ?? 0, sub: "immutable history" },
          { label: "Patients", value: totals?.patients ?? 0, sub: "compartments" },
          { label: "Audit events", value: totals?.auditEvents ?? 0, sub: audit.verified ? "chain verified" : "chain broken" },
          { label: "Conformance", value: `${pct(conf.pass, confTotal)}%`, sub: "US-Core pass rate" },
        ].map((s) => (
          <Card key={s.label} tone="raised">
            <CardContent className="py-3">
              <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
              <div className="text-xs text-text-muted mt-0.5">{s.label}</div>
              <div className="text-[10px] text-text-subtle uppercase tracking-wide mt-1">{s.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Zone pipeline */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Lakehouse zones</CardTitle>
          <CardDescription>
            Each zone is an Iceberg catalog. Data flows left to right; Gold is the canonical truth every other zone derives from.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {ZONE_ORDER.map((zone, i) => {
              const z = zonesByName.get(zone);
              const accent = ZONE_ACCENT[zone];
              return (
                <div key={zone} className="relative rounded-xl border border-border/70 p-3 bg-surface">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
                    <span className="text-xs font-semibold capitalize">{zone}</span>
                  </div>
                  <div className="text-xl font-semibold tabular-nums mt-1.5">{z?.rows ?? 0}</div>
                  <div className="text-[10px] text-text-subtle mt-0.5 leading-snug">{z?.description}</div>
                  <code className="text-[9px] text-text-subtle/70 mt-1 block truncate">{z?.catalog}</code>
                  {i < ZONE_ORDER.length - 1 && (
                    <span className="hidden lg:block absolute -right-[7px] top-1/2 -translate-y-1/2 text-text-subtle/40">→</span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Resource catalog */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Gold-zone catalog</CardTitle>
          <CardDescription>Live resource inventory with US-Core conformance and source provenance.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-subtle text-[11px] uppercase tracking-wide">
                  <th className="py-2 pr-4">Resource</th>
                  <th className="py-2 pr-4 text-right">Count</th>
                  <th className="py-2 pr-4 text-right">Versions</th>
                  <th className="py-2 pr-4">Conformance</th>
                  <th className="py-2 pr-4 text-right">Mapping</th>
                  <th className="py-2 pr-4">Sources</th>
                  <th className="py-2">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {resourceTypes.map((rt) => (
                  <tr key={rt.resourceType} className="border-t border-border/60 align-middle">
                    <td className="py-2.5 pr-4 font-mono">
                      <Link href={`/api/leafnerd/fhir/${rt.resourceType}`} target="_blank" className="text-accent hover:underline">
                        {rt.resourceType}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{rt.count}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-text-muted">{rt.versions}</td>
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex items-center gap-2">
                        <ConformanceBar c={rt.conformance} />
                        <span className="text-[11px] text-text-subtle tabular-nums">{pct(rt.conformance.pass, rt.count)}%</span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-text-muted">{Math.round(rt.meanConfidence * 100)}%</td>
                    <td className="py-2.5 pr-4 text-text-muted text-xs">{rt.sources.join(", ") || "—"}</td>
                    <td className="py-2.5 text-text-subtle text-xs">{rt.lastUpdated?.slice(0, 10) ?? "—"}</td>
                  </tr>
                ))}
                {resourceTypes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-text-subtle text-sm">
                      Lakehouse is empty — seed the leafnerd-demo org to populate it.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Interactive query playground */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Query playground</CardTitle>
          <CardDescription>
            Run live FHIR searches against the Gold zone. Every panel shows the exact request URL — copy it into any HTTP client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FhirQueryPlayground
            resourceTypes={resourceTypes.map((r) => r.resourceType)}
            searchParams={SEARCH_PARAMS}
            commonParams={commonParams}
          />
        </CardContent>
      </Card>

      {/* Audit chain */}
      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Audit chain</CardTitle>
            <CardDescription>Every state change is hash-chained to the previous event — tamper-evident by construction.</CardDescription>
          </div>
          <Badge tone={audit.verified ? "success" : "danger"}>
            {audit.verified ? `✓ verified · ${audit.total} events` : "chain broken"}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {audit.entries.map((e) => (
              <div key={e.auditId} className="flex items-center gap-3 text-xs py-1 border-b border-border/40 last:border-0">
                <span className="font-mono text-text-subtle w-8 text-right">#{e.seq}</span>
                <Badge tone={e.action === "C" ? "success" : e.action === "D" ? "danger" : "info"}>{e.action}</Badge>
                <span className="text-text-muted flex-1 truncate">{e.description}</span>
                <code className="text-text-subtle/70 hidden md:inline" title={`prev: ${e.prevHash}`}>{e.rowHash.slice(0, 12)}…</code>
              </div>
            ))}
            {audit.entries.length === 0 && <div className="text-sm text-text-subtle">No audit events yet.</div>}
          </div>
        </CardContent>
      </Card>

      {/* Capability / learn */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Supported interactions</CardTitle>
            <CardDescription>What the Gold-zone REST surface serves today.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-text-muted">
              <li>• <code>read</code> · <code>vread</code> — current + historical versions</li>
              <li>• <code>search-type</code> — string / token / reference / date params</li>
              <li>• <code>history-instance</code> — full immutable version stack</li>
              <li>• <code>Patient/$everything</code> — compartment export</li>
              <li>• <code>metadata</code> — CapabilityStatement (FHIR R4 4.0.1)</li>
            </ul>
            <p className="text-xs text-text-subtle mt-3">
              {capability ? "Capability published from the live engine." : "Capability unavailable."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Indexed search parameters</CardTitle>
            <CardDescription>The US-Core-aligned subset the engine indexes.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[220px] overflow-auto">
              {Object.entries(SEARCH_PARAMS).map(([type, params]) => (
                <div key={type} className="text-xs">
                  <span className="font-mono font-medium">{type}</span>
                  <span className="text-text-subtle"> — {params.map((p) => p.name).join(", ")}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Integration reference (what ships / roadmap / flow) */}
      <Card>
        <CardHeader>
          <CardTitle>Ingestion & integration</CardTitle>
          <CardDescription>How outside data enters the lakehouse.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-text-subtle mb-2">Live adapters</div>
              <ul className="space-y-1.5 text-sm text-text-muted">
                <li>• HL7 FHIR R4 R/W mappers</li>
                <li>• HL7 v2 ADT/ORU inbound</li>
                <li>• X-12 270/271 eligibility</li>
                <li>• Internal intake + portal capture</li>
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-text-subtle mb-2">Roadmap</div>
              <ul className="space-y-1.5 text-sm text-text-muted">
                <li>• SMART on FHIR app launch</li>
                <li>• Bulk Data ($export, async polling)</li>
                <li>• C-CDA import via $convert</li>
                <li>• Durable Iceberg/Parquet storage</li>
              </ul>
            </div>
          </div>
          <ol className="space-y-2 text-sm text-text-muted list-decimal pl-5 mt-5 border-t border-border/60 pt-4">
            <li>Partner exchanges OAuth2 client credentials with our CSM.</li>
            <li>Inbound artifact lands immutable in <span className="font-mono">Bronze</span>; a parse shape lands in <span className="font-mono">Silver</span>.</li>
            <li>Mappers normalize to canonical FHIR R4 in <span className="font-mono">Gold</span> (this catalog).</li>
            <li>Platinum marts + Vector embeddings derive from Gold; every step emits an <span className="font-mono">Audit</span> event.</li>
            <li>Partners read via <span className="font-mono">/api/leafnerd/fhir/&lt;Resource&gt;</span> with conformant Bundles.</li>
          </ol>
        </CardContent>
      </Card>
    </PageShell>
  );
}
