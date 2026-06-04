"use client";
/* ─────────────────────────────────────────────────────────────────────────
   LEAFNERD — Data · Admin & Governance console

   The governance payoff surface: where the Overview anomalies resolve.
   Riverside Lab's 41% drop, Northbay's 312 unmapped MedicationRequest codes,
   and the 58 duplicate-identity candidate pairs all land here as inspectable,
   actionable governance — connected feeds, terminology coverage, identity
   resolution, access control, and a tamper-evident audit trail.

   Self-contained & SSR-safe: all data is curated and deterministic (no
   Math.random / Date.now), so it renders identically on server and client and
   needs zero props beyond the shared `toast` + `openRecord` drawer hook. Uses
   only existing botanical theme classes — adds no CSS.
   ──────────────────────────────────────────────────────────────────────── */
import React from "react";
import { Icon, Badge, Conf, Sparkline } from "./primitives";
import type { DrawerPayload } from "./Drawer";

// ── Types (local, self-contained) ──────────────────────────────────────────
type FeedStatus = "healthy" | "degraded" | "down";

interface Feed {
  id: string;
  name: string;
  org: string;
  format: string; // HL7v2 ORU · FHIR R4 · X12 837P …
  resources: string[]; // FHIR resource types this feed produces
  volume: string; // human throughput, e.g. "1.2K/day"
  throughputPct: number; // % of 30-day baseline (100 = nominal)
  lastSync: string;
  status: FeedStatus;
  spark: number[]; // last ~10 buckets, % of baseline
  note: string;
}

interface CodeSystem {
  id: string;
  name: string; // LOINC, SNOMED CT, RxNorm …
  domain: string; // Labs & vitals, Problems, Medications …
  mapped: number; // 0..1 coverage
  concepts: number; // total mapped concepts
  unmapped: number; // outstanding unmapped codes
  tone: "green" | "amber" | "rose";
}

interface DupPair {
  id: string;
  a: string;
  b: string;
  similarity: number; // 0..1
  basis: string; // what drove the match
  sources: string; // e.g. "Northbay EHR ↔ Riverside Lab"
}

interface Role {
  id: string;
  name: string;
  members: number;
  scope: string;
  tone: "green" | "amber" | "indigo" | "gray";
}

interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  when: string;
  kind: "access" | "export" | "merge" | "mapping" | "config";
}

// ── Curated governance data ────────────────────────────────────────────────
const FEEDS: Feed[] = [
  {
    id: "northbay-ehr",
    name: "Northbay Clinic EHR",
    org: "Northbay Health Partners",
    format: "FHIR R4 · bulk $export",
    resources: ["Patient", "Encounter", "Condition", "MedicationRequest"],
    volume: "1.4K/day",
    throughputPct: 103,
    lastSync: "8 min ago",
    status: "healthy",
    spark: [88, 92, 90, 95, 99, 101, 104, 100, 103, 103],
    note: "Onboarded May 18. Volume nominal; new medication vocabulary still resolving against RxNorm (see Terminology).",
  },
  {
    id: "riverside-lab",
    name: "Riverside Lab",
    org: "Riverside Diagnostics",
    format: "HL7v2 ORU ^ R01",
    resources: ["Observation", "DiagnosticReport"],
    volume: "710/day",
    throughputPct: 59,
    lastSync: "2 h ago",
    status: "degraded",
    spark: [98, 100, 97, 101, 99, 96, 92, 70, 61, 59],
    note: "Observation throughput fell 41% against a stable 30-day baseline at 15:00. Probable interface outage — incident routed to integration.",
  },
  {
    id: "cedar-ehr",
    name: "Cedar Clinic EHR",
    org: "Cedar Primary Care",
    format: "FHIR R4 · subscription",
    resources: ["Patient", "Encounter", "Observation", "Condition"],
    volume: "980/day",
    throughputPct: 99,
    lastSync: "3 min ago",
    status: "healthy",
    spark: [96, 98, 97, 99, 100, 98, 101, 99, 100, 99],
    note: "Stable. Highest US Core conformance of any feed at 99.4%.",
  },
  {
    id: "payer-claims",
    name: "Meridian Payer Feed",
    org: "Meridian Health Plan",
    format: "X12 837P / 835 · SFTP",
    resources: ["Claim", "Coverage", "ExplanationOfBenefit"],
    volume: "6.1K/wk",
    throughputPct: 100,
    lastSync: "Yesterday 23:40",
    status: "healthy",
    spark: [100, 99, 101, 100, 100, 98, 100, 101, 100, 100],
    note: "Weekly batch. Drives risk-adjustment and PMPM cost analytics; reconciled against EHR encounters.",
  },
  {
    id: "wearable",
    name: "Patient Wearable Stream",
    org: "Consumer devices (BYO)",
    format: "FHIR R4 · Observation write",
    resources: ["Observation"],
    volume: "12K/day",
    throughputPct: 88,
    lastSync: "1 min ago",
    status: "degraded",
    spark: [94, 96, 90, 92, 88, 85, 89, 87, 88, 88],
    note: "High volume, lower identity confidence (avg 0.71). Excluded from quality measures until linked to a resolved Patient.",
  },
];

const STATUS_META: Record<FeedStatus, { tone: "green" | "amber" | "rose"; label: string }> = {
  healthy: { tone: "green", label: "Healthy" },
  degraded: { tone: "amber", label: "Degraded" },
  down: { tone: "rose", label: "Down" },
};

const CODE_SYSTEMS: CodeSystem[] = [
  { id: "loinc", name: "LOINC", domain: "Labs & vitals", mapped: 0.972, concepts: 1840, unmapped: 41, tone: "green" },
  { id: "snomed", name: "SNOMED CT", domain: "Problems & findings", mapped: 0.961, concepts: 6120, unmapped: 88, tone: "green" },
  { id: "rxnorm", name: "RxNorm", domain: "Medications", mapped: 0.782, concepts: 3410, unmapped: 312, tone: "rose" },
  { id: "icd10", name: "ICD-10-CM", domain: "Diagnoses (billing)", mapped: 0.944, concepts: 4280, unmapped: 96, tone: "amber" },
  { id: "cpt", name: "CPT / HCPCS", domain: "Procedures", mapped: 0.918, concepts: 2110, unmapped: 64, tone: "amber" },
];

const DUP_PAIRS: DupPair[] = [
  { id: "dp-1", a: "Marcus Delgado · PT-40291", b: "Marcus J. Delgado · PT-51188", similarity: 0.94, basis: "Name + DOB + last-4 SSN; divergent MRN", sources: "Northbay EHR ↔ Riverside Lab" },
  { id: "dp-2", a: "Priya Nair · PT-41003", b: "Priya Nair · PT-41977", similarity: 0.91, basis: "Exact name + DOB; address mismatch", sources: "Cedar EHR ↔ Meridian Claims" },
  { id: "dp-3", a: "Hassan Ali · PT-41277", b: "Hassan Ali · WB-30822", similarity: 0.86, basis: "Name + phone; wearable identity 0.71", sources: "Northbay EHR ↔ Wearable" },
  { id: "dp-4", a: "Grace Okoro · PT-39902", b: "Grace O. Okoro · PT-40510", similarity: 0.85, basis: "Name + DOB; no shared identifier", sources: "Cedar EHR ↔ Northbay EHR" },
];

const ROLES: Role[] = [
  { id: "r-phl", name: "Population Health Lead", members: 3, scope: "Full read · cohort export · outreach", tone: "green" },
  { id: "r-qa", name: "Quality Analyst", members: 7, scope: "Measures, gaps, cohorts · no PHI export", tone: "indigo" },
  { id: "r-steward", name: "Data Steward", members: 2, scope: "Mapping + identity merge · audit-logged", tone: "amber" },
  { id: "r-aud", name: "Read-only Auditor", members: 4, scope: "Read · provenance & audit trail only", tone: "gray" },
];

const AUDIT: AuditEvent[] = [
  { id: "ae-1", actor: "L. Reyes", action: "Exported cohort", target: "Rising-risk diabetics (n=42) → CSV", when: "14 min ago", kind: "export" },
  { id: "ae-2", actor: "System", action: "Flagged anomaly", target: "Riverside Lab throughput −41%", when: "2 h ago", kind: "config" },
  { id: "ae-3", actor: "D. Steward", action: "Merged identities", target: "PT-40291 ← PT-51188 (0.94)", when: "Yesterday 16:20", kind: "merge" },
  { id: "ae-4", actor: "D. Steward", action: "Mapped local code", target: "MTF1000 → RxNorm 860975 (Metformin)", when: "Yesterday 15:55", kind: "mapping" },
  { id: "ae-5", actor: "A. Quality", action: "Viewed patient", target: "Marcus Delgado · PT-40291", when: "Yesterday 14:02", kind: "access" },
  { id: "ae-6", actor: "Meridian", action: "Ingested batch", target: "X12 837P · 6,114 claims", when: "Yesterday 23:40", kind: "config" },
];

const AUDIT_TONE: Record<AuditEvent["kind"], "green" | "amber" | "rose" | "indigo" | "gray"> = {
  access: "gray",
  export: "indigo",
  merge: "green",
  mapping: "amber",
  config: "gray",
};

// ── Drawer payload builders (reuse the global aperture) ─────────────────────
function feedDrawer(f: Feed): DrawerPayload {
  const s = STATUS_META[f.status];
  return {
    kind: "record",
    tag: "Data source",
    title: f.name,
    sub: (
      <React.Fragment>
        <Badge tone={s.tone} dot={false}>{s.label}</Badge>
        <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{f.format}</span>
      </React.Fragment>
    ),
    render: (_tab, toast) => (
      <React.Fragment>
        <div className="norm-section">
          <div className="nh">Connection</div>
          <div className="norm-card">
            <dl className="kv">
              <dt>Organization</dt><dd>{f.org}</dd>
              <dt>Interface</dt><dd className="mono">{f.format}</dd>
              <dt>Resources</dt><dd>{f.resources.join(" · ")}</dd>
              <dt>Throughput</dt><dd className="tnum">{f.volume} · {f.throughputPct}% of baseline</dd>
              <dt>Last sync</dt><dd>{f.lastSync}</dd>
              <dt>Status</dt><dd><Badge tone={s.tone} dot={false}>{s.label}</Badge></dd>
            </dl>
          </div>
        </div>
        <div className="norm-section">
          <div className="nh">Assessment</div>
          <div className="norm-card"><div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{f.note}</div></div>
        </div>
        <div className="norm-section">
          <div className="nh">Ingestion lineage</div>
          <div className="norm-card" style={{ padding: "6px 0" }}>
            {[
              { t: "Received at edge", m: `${f.format} · TLS 1.3` },
              { t: "Validated", m: f.status === "healthy" ? "US Core 6.1 · conformant" : "US Core 6.1 · warnings present" },
              { t: "Mapped to FHIR R4", m: "Terminology resolved against value sets" },
              { t: "Published", m: `Last sync ${f.lastSync}` },
            ].map((e, i, arr) => (
              <div key={i} className="prov-step" style={{ padding: "0 16px 16px" }}>
                <span className="prov-dot"><Icon name={i === arr.length - 1 ? "check" : "dot"} size={11} /></span>
                <div><div className="ps-t">{e.t}</div><div className="ps-m">{e.m}</div></div>
              </div>
            ))}
          </div>
        </div>
        {f.status !== "healthy" && (
          <button className="insight-action" style={{ width: "100%", justifyContent: "center", background: f.status === "down" ? "var(--rose)" : undefined }}
            onClick={() => toast(`Incident opened for ${f.name} · integration team notified`)}>
            <Icon name="bolt" size={15} />Open interface incident
          </button>
        )}
      </React.Fragment>
    ),
  };
}

function dupDrawer(d: DupPair): DrawerPayload {
  return {
    kind: "record",
    tag: "Identity resolution",
    title: "Candidate duplicate pair",
    sub: (
      <React.Fragment>
        <Badge tone={d.similarity >= 0.9 ? "rose" : "amber"} dot={false}>{Math.round(d.similarity * 100)}% similarity</Badge>
        <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{d.sources}</span>
      </React.Fragment>
    ),
    render: (_tab, toast) => (
      <React.Fragment>
        <div className="norm-section">
          <div className="nh">Candidate records</div>
          <div className="norm-card">
            <dl className="kv">
              <dt>Record A</dt><dd className="mono">{d.a}</dd>
              <dt>Record B</dt><dd className="mono">{d.b}</dd>
              <dt>Match basis</dt><dd>{d.basis}</dd>
              <dt>Sources</dt><dd>{d.sources}</dd>
              <dt>Similarity</dt><dd><span style={{ display: "inline-flex" }}><Conf value={d.similarity} /></span></dd>
            </dl>
          </div>
        </div>
        <div className="norm-section">
          <div className="nh">Steward decision</div>
          <div className="norm-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-2)" }}>
              Merging links both records to a single resolved Patient and re-attributes all downstream resources. The action is reversible and written to the audit trail.
            </div>
            <div style={{ display: "flex", gap: 9 }}>
              <button className="insight-action" style={{ flex: 1, justifyContent: "center" }} onClick={() => toast(`Merged — ${d.a.split(" · ")[0]} resolved to a single identity`)}>
                <Icon name="check" size={15} />Confirm merge
              </button>
              <button className="cmd-ctrl" onClick={() => toast("Marked as distinct individuals — pair dismissed")}>
                <Icon name="x" size={14} />Not a match
              </button>
            </div>
          </div>
        </div>
      </React.Fragment>
    ),
  };
}

// ── Sub-components ──────────────────────────────────────────────────────────
function GovStat({ icon, tone, value, label, sub }: { icon: string; tone: string; value: React.ReactNode; label: string; sub: string }) {
  const color = tone === "rose" ? "var(--rose)" : tone === "amber" ? "var(--amber)" : "var(--canopy)";
  return (
    <div className="card card-pad">
      <div className="between">
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{label}</span>
        <span style={{ color }}><Icon name={icon} size={16} /></span>
      </div>
      <div className="tnum" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-.025em", marginTop: 6 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function FeedCard({ f, onOpen }: { f: Feed; onOpen: (f: Feed) => void }) {
  const s = STATUS_META[f.status];
  const color = s.tone === "rose" ? "var(--rose)" : s.tone === "amber" ? "var(--amber)" : "var(--canopy)";
  return (
    <div className="card lift card-pad" style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 11 }} onClick={() => onOpen(f)}>
      <div className="between" style={{ alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0, display: "flex", gap: 11 }}>
          <span className="m-ic" style={{ background: "var(--indigo-soft)", color: "var(--indigo)", width: 30, height: 30, flex: "none" }}><Icon name="source" size={16} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-.01em", lineHeight: 1.25 }}>{f.name}</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{f.format}</div>
          </div>
        </div>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>

      <div className="wrap-gap">
        {f.resources.map((r) => <Badge key={r} tone="gray" mono dot={false}>{r}</Badge>)}
      </div>

      <div className="between" style={{ paddingTop: 11, borderTop: "1px solid var(--line-soft)", gap: 10 }}>
        <div>
          <div className="tnum" style={{ fontSize: 15, fontWeight: 600, color, lineHeight: 1 }}>{f.throughputPct}%</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{f.volume} · vs baseline</div>
        </div>
        <Sparkline data={f.spark} color={color} w={92} h={28} />
      </div>
      <div className="m-prov" style={{ marginTop: -2 }}><Icon name="clock" size={11} /> Last sync {f.lastSync}</div>
    </div>
  );
}

// ── Surface ─────────────────────────────────────────────────────────────────
export function AdminSurface({
  toast,
  openRecord,
}: {
  toast?: (m: string) => void;
  openRecord?: (p: DrawerPayload) => void;
}) {
  const t = (m: string) => toast?.(m);
  const openFeed = (f: Feed) => (openRecord ? openRecord(feedDrawer(f)) : t(`Inspecting ${f.name}…`));
  const openDup = (d: DupPair) => (openRecord ? openRecord(dupDrawer(d)) : t("Opening duplicate pair…"));

  const healthy = FEEDS.filter((f) => f.status === "healthy").length;
  const degraded = FEEDS.filter((f) => f.status !== "healthy").length;
  const totalUnmapped = CODE_SYSTEMS.reduce((s, c) => s + c.unmapped, 0);
  const avgMapped = CODE_SYSTEMS.reduce((s, c) => s + c.mapped, 0) / CODE_SYSTEMS.length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Data · Governance</div>
          <h1 className="page-title">Admin &amp; data governance</h1>
          <p className="page-lede">
            The control plane behind every number — connected feeds, terminology coverage, identity
            resolution, role-scoped access, and a tamper-evident audit trail. This is where the
            anomalies on the Overview resolve.
          </p>
        </div>
        <div className="page-head-actions">
          <button className="cmd-ctrl" onClick={() => t("Connect a source — launching the feed wizard…")}>
            <Icon name="plus" size={15} />Connect source
          </button>
          <button className="cmd-ctrl" onClick={() => t("Exporting signed audit log (CSV)…")}>
            <Icon name="download" size={15} />Export audit log
          </button>
        </div>
      </div>

      {/* governance KPIs */}
      <div className="grid g-4" style={{ marginTop: 8 }}>
        <GovStat icon="source" tone={degraded ? "amber" : "green"} value={<>{healthy}<span style={{ fontSize: 16, color: "var(--muted)", fontWeight: 500 }}> / {FEEDS.length}</span></>} label="Connected feeds" sub={`${degraded} need attention`} />
        <GovStat icon="git" tone="amber" value={`${(avgMapped * 100).toFixed(1)}%`} label="Terminology coverage" sub={`${totalUnmapped} codes unmapped`} />
        <GovStat icon="users" tone="amber" value={DUP_PAIRS.length === 4 ? "58" : String(DUP_PAIRS.length)} label="Identity queue" sub="candidate pairs ≥ 0.85" />
        <GovStat icon="shield" tone="green" value="100%" label="Actions audited" sub="every read, export & merge" />
      </div>

      {/* Data sources */}
      <div className="sec-title">
        <h2>Connected data sources</h2>
        <span className="count">{FEEDS.length} feeds</span>
        <span className="link" onClick={() => t("Opening source health monitor…")}>Health monitor<Icon name="arrowR" size={14} /></span>
      </div>
      <div className="grid g-3">
        {FEEDS.map((f) => <FeedCard key={f.id} f={f} onOpen={openFeed} />)}
      </div>

      {/* Terminology & mapping health */}
      <div className="sec-title">
        <h2>Terminology &amp; mapping health</h2>
        <span className="count">5 code systems</span>
        <span className="link" onClick={() => t(`Opening unmapped review queue · ${totalUnmapped} codes…`)}>Review {totalUnmapped} unmapped<Icon name="arrowR" size={14} /></span>
      </div>
      <div className="card card-pad">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {CODE_SYSTEMS.map((c) => {
            const pct = Math.round(c.mapped * 100);
            const color = c.tone === "rose" ? "var(--rose)" : c.tone === "amber" ? "var(--amber)" : "var(--canopy)";
            return (
              <div key={c.id} className="between" style={{ gap: 16 }}>
                <div style={{ width: 188, flex: "none" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>{c.domain}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ height: 8, background: "var(--cream-deep)", borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ width: pct + "%", height: "100%", background: color, borderRadius: 5, transition: "width .7s ease" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>{c.concepts.toLocaleString()} concepts mapped</div>
                </div>
                <div className="tnum" style={{ width: 52, textAlign: "right", fontSize: 14, fontWeight: 600, color }}>{pct}%</div>
                <div style={{ width: 132, flex: "none", textAlign: "right" }}>
                  {c.unmapped > 0 ? (
                    <button className="chip" onClick={() => t(`Mapping ${c.unmapped} ${c.name} codes…`)}>
                      <Icon name="alert" size={13} />{c.unmapped} unmapped
                    </button>
                  ) : (
                    <Badge tone="green" dot={false}>Complete</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="m-prov" style={{ marginTop: 14 }}>
          <Icon name="layers" size={11} /> RxNorm coverage dropped after Northbay onboarding introduced 312 local medication codes — the largest single driver of the open mapping queue.
        </div>
      </div>

      {/* Identity resolution + Access side by side */}
      <div className="grid g-3" style={{ marginTop: 24 }}>
        <div className="card span-2" style={{ overflow: "hidden" }}>
          <div className="between" style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-soft)" }}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>Identity resolution queue</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Candidate duplicate pairs above 0.85 similarity, awaiting steward review</div>
            </div>
            <Badge tone="amber">58 pending</Badge>
          </div>
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Candidate pair</th>
                  <th>Match basis</th>
                  <th style={{ textAlign: "right" }}>Similarity</th>
                  <th style={{ width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {DUP_PAIRS.map((d) => (
                  <tr key={d.id} onClick={() => openDup(d)}>
                    <td>
                      <div className="pt-name" style={{ fontSize: 12.5 }}>{d.a}</div>
                      <div className="pt-id">↔ {d.b}</div>
                    </td>
                    <td><span style={{ fontSize: 12, color: "var(--ink-2)" }}>{d.basis}</span><div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{d.sources}</div></td>
                    <td style={{ textAlign: "right" }}>
                      <Badge tone={d.similarity >= 0.9 ? "rose" : "amber"} dot={false}>{Math.round(d.similarity * 100)}%</Badge>
                    </td>
                    <td><span className="row-action"><Icon name="chevR" size={15} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-pad">
          <div className="between" style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Access &amp; roles</div>
            <span style={{ color: "var(--canopy)" }}><Icon name="shield" size={16} /></span>
          </div>
          {ROLES.map((r) => (
            <div key={r.id} className="between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line-soft)", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 550 }}>{r.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.35, textWrap: "pretty" }}>{r.scope}</div>
              </div>
              <Badge tone={r.tone} dot={false}>{r.members}</Badge>
            </div>
          ))}
          <button className="cmd-ctrl" style={{ width: "100%", justifyContent: "center", marginTop: 12 }} onClick={() => t("Opening role & access settings…")}>
            <Icon name="gear" size={14} />Manage access
          </button>
        </div>
      </div>

      {/* Audit trail */}
      <div className="sec-title">
        <h2>Audit trail</h2>
        <span className="count">tamper-evident</span>
        <span className="link" onClick={() => t("Exporting signed audit log (CSV)…")}>Export<Icon name="arrowR" size={14} /></span>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th style={{ textAlign: "right" }}>When</th>
              </tr>
            </thead>
            <tbody>
              {AUDIT.map((e) => (
                <tr key={e.id} style={{ cursor: "default" }}>
                  <td><span style={{ fontSize: 12.5, fontWeight: 550 }}>{e.actor}</span></td>
                  <td><Badge tone={AUDIT_TONE[e.kind]} dot={false}>{e.action}</Badge></td>
                  <td><span className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>{e.target}</span></td>
                  <td style={{ textAlign: "right" }}><span className="muted" style={{ fontSize: 12 }}>{e.when}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default AdminSurface;
