"use client";
/* LEAFNERD — global right drawer (the "aperture") + JSON viewer */
import React from "react";
import { Icon, Badge, Conf, AreaChart } from "./primitives";
import { RiskBadge } from "./widgets";
import type {
  LeafnerdData,
  FhirResource,
  PatientRow,
  Metric,
  Anomaly,
  Insight,
  ProvenanceStep,
} from "@/lib/leafnerd/types";

export interface DrawerPayload {
  kind: "fhir" | "patient" | "metric" | "anomaly" | "insight" | "record";
  tag: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  tab?: string;
  render: (tab: string, toast: (m: string) => void) => React.ReactNode;
}

function syntaxJSON(obj: unknown) {
  const json = JSON.stringify(obj, null, 2);
  const esc = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/("(\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+\.?\d*(e[+-]?\d+)?/gi,
    (m, str, _i, colon, kw, _n) => {
      if (str !== undefined && colon) return `<span class="k">${str}</span>${colon}`;
      if (str !== undefined) return `<span class="s">${str}</span>`;
      if (kw) return `<span class="b">${kw}</span>`;
      return `<span class="n">${m}</span>`;
    });
}

export function JsonView({ data }: { data: unknown }) {
  return <pre className="json" dangerouslySetInnerHTML={{ __html: syntaxJSON(data) }} />;
}

export function ValItem({ kind, children }: { kind: "ok" | "warn" | "err"; children: React.ReactNode }) {
  const ic = kind === "ok" ? "check" : kind === "warn" ? "alert" : "x";
  return <div className={`validation-item ${kind}`}><span className="vi-ic"><Icon name={ic} size={15} /></span><div>{children}</div></div>;
}

export function ProvSteps({ steps }: { steps: ProvenanceStep[] }) {
  return <div style={{ marginTop: 4 }}>
    {steps.map((s, i) => (
      <div key={i} className="prov-step">
        <span className="prov-dot"><Icon name={i === steps.length - 1 ? "check" : "dot"} size={12} /></span>
        <div><div className="ps-t">{s.t}</div><div className="ps-m">{s.m}</div></div>
      </div>
    ))}
  </div>;
}

/* ---- Per-patient risk-driver decomposition (explainability) ----
   Deterministic: derived purely from the patient's own fields so the same
   patient always yields the same breakdown. Weights are normalized to sum to
   100% — answering "why is this score what it is?" without a black box. */
function lastEncDays(s: string): number {
  const m = /(\d+)\s*(mo|wk|w|d|m|y)/i.exec(s || "");
  if (!m) return 14;
  const n = parseInt(m[1], 10);
  const u = m[2].toLowerCase();
  if (u === "d") return n;
  if (u === "w" || u === "wk") return n * 7;
  if (u === "mo" || u === "m") return n * 30;
  if (u === "y") return n * 365;
  return n;
}

const DRIVER_TONE: Record<string, string> = {
  rose: "var(--c-rose)", amber: "var(--c-amber)", indigo: "var(--c-indigo)", sage: "var(--c-sage)",
};

function riskDrivers(p: PatientRow): { label: string; pct: number; detail: string; res: string; tone: string }[] {
  const c = (p.cohort || "").toLowerCase();
  const has = (k: string) => c.includes(k);
  const acute = has("chf") || has("ckd") || has("copd") || has("mi");
  const diabetic = has("diabet") || has("dm");
  const raw = [
    { label: "Comorbidity burden", w: Math.max(0.4, p.hcc), detail: `HCC ${p.hcc.toFixed(2)} across active conditions`, res: "Condition", tone: "rose" },
    { label: "Acute utilization", w: (acute ? 2.4 : 1.0) * (0.6 + p.score), detail: acute ? "ED / inpatient above cohort baseline" : "Recent encounter pattern", res: "Encounter · Claim", tone: "amber" },
    { label: "Medication adherence", w: (diabetic ? 1.9 : has("pain") || has("anxiety") || has("insomnia") ? 1.3 : 0.7) * (0.6 + p.gaps * 0.12), detail: diabetic ? "Refill cadence vs. expected (glycemic regimen)" : "Refill cadence vs. expected", res: "MedicationRequest", tone: "indigo" },
    { label: "Open care gaps", w: 0.5 + p.gaps * 0.7, detail: `${p.gaps} overdue measure${p.gaps === 1 ? "" : "s"}`, res: "Quality measure", tone: "sage" },
    { label: "Engagement recency", w: Math.min(2.4, lastEncDays(p.lastEnc) / 14), detail: `Last encounter ${p.lastEnc} ago`, res: "Encounter", tone: "amber" },
  ];
  const total = raw.reduce((s, d) => s + d.w, 0) || 1;
  const pcts = raw.map((d) => ({ label: d.label, detail: d.detail, res: d.res, tone: d.tone, pct: Math.round((d.w / total) * 100) }));
  pcts.sort((a, b) => b.pct - a.pct);
  const sum = pcts.reduce((s, d) => s + d.pct, 0);
  if (pcts.length) pcts[0].pct += 100 - sum; // absorb rounding into the top driver
  return pcts;
}

function RiskDrivers({ p }: { p: PatientRow }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      {riskDrivers(p).map((d, i) => (
        <div key={i}>
          <div className="between" style={{ marginBottom: 4, gap: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 540 }}>{d.label}</span>
            <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: DRIVER_TONE[d.tone] }}>{d.pct}%</span>
          </div>
          <div style={{ height: 7, background: "var(--cream-deep)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ width: d.pct + "%", height: "100%", background: DRIVER_TONE[d.tone], borderRadius: 5, transition: "width .6s ease" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{d.detail}</span>
            <span className="dotsep">·</span>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--faint)" }}>{d.res}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* Downstream-impact block — the quantified "so what" / blast radius of a
   signal, framed as a watch (amber) rather than a hard error. */
function ImpactList({ items }: { items?: string[] }) {
  if (!items || !items.length) return null;
  return (
    <div className="norm-section">
      <div className="nh">Downstream impact</div>
      <div className="norm-card" style={{ background: "var(--amber-soft)", borderColor: "#e6d6ad" }}>
        {items.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: i ? "8px 0 0" : 0 }}>
            <span style={{ color: "var(--amber)", flex: "none", marginTop: 2 }}><Icon name="arrowR" size={13} /></span>
            <span style={{ fontSize: 12.5, lineHeight: 1.45, color: "#5f4a13" }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Drawer({ payload, onClose, toast }: { payload: DrawerPayload; onClose: () => void; toast: (m: string) => void }) {
  const [tab, setTab] = React.useState(payload.tab || "summary");
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const tabsFor: [string, string][] = ({
    fhir:    [["summary", "Normalized"], ["raw", "Raw JSON"], ["prov", "Provenance"], ["valid", "Validation"]],
    patient: [["summary", "Summary"], ["prov", "Provenance"], ["raw", "FHIR"]],
    metric:  [["summary", "Detail"], ["prov", "Provenance"]],
    anomaly: [["summary", "Detail"], ["prov", "Provenance"]],
    insight: [["summary", "Evidence"], ["prov", "Lineage"]],
  } as Record<string, [string, string][]>)[payload.kind] || [["summary", "Detail"]];

  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose}></div>
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div>
            <div className="dh-tag">{payload.tag}</div>
            <h3>{payload.title}</h3>
            {payload.sub && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{payload.sub}</div>}
          </div>
          <button className="drawer-close" onClick={onClose}><Icon name="x" size={17} /></button>
        </div>
        <div className="drawer-tabs">
          {tabsFor.map(([id, label]) => <div key={id} className={`drawer-tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>{label}</div>)}
        </div>
        <div className="drawer-body">
          {payload.render(tab, toast)}
        </div>
      </aside>
    </React.Fragment>
  );
}

/* ---- Drawer payload builders ---- */
export const buildDrawer = {
  fhir(r: FhirResource): DrawerPayload {
    return {
      kind: "fhir", tag: `FHIR · ${r.type}`, title: r.label,
      sub: <React.Fragment><Badge tone="indigo" mono dot={false}>{r.type}</Badge><span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.id}</span><span className="dotsep">·</span>{r.date}</React.Fragment>,
      render(tab) {
        if (tab === "raw") return <JsonView data={r.json} />;
        if (tab === "prov") return <ProvSteps steps={r.provenance} />;
        if (tab === "valid") {
          if (r.valid === "pass") return <React.Fragment>
            <ValItem kind="ok">Conforms to <b>{r.profile}</b> · US Core 6.1</ValItem>
            <ValItem kind="ok">All required elements present</ValItem>
            <ValItem kind="ok">Terminology bindings resolved</ValItem>
          </React.Fragment>;
          if (r.valid === "warn") return <React.Fragment>
            <ValItem kind="ok">Conforms to base FHIR R4 structure</ValItem>
            <ValItem kind="warn">Missing <b>component.code</b> for one blood-pressure reading</ValItem>
            <ValItem kind="ok">Subject reference resolves to known Patient</ValItem>
          </React.Fragment>;
          return <React.Fragment>
            <ValItem kind="err">No recognized coding system on <b>medicationCodeableConcept</b></ValItem>
            <ValItem kind="warn">RxNorm match confidence 0.58 — below 0.80 threshold</ValItem>
            <ValItem kind="ok">Subject & intent are valid</ValItem>
          </React.Fragment>;
        }
        // summary / normalized
        return <React.Fragment>
          <div className="norm-section">
            <div className="nh">Normalized view</div>
            <div className="norm-card">
              <dl className="kv">
                <dt>Resource</dt><dd>{r.type}</dd>
                <dt>Status</dt><dd><Badge tone={r.status === "active" || r.status === "final" || r.status === "finished" ? "green" : "gray"} dot={false}>{r.status}</Badge></dd>
                <dt>Patient</dt><dd>{r.patient}</dd>
                <dt>Code</dt><dd className="mono">{r.code}</dd>
                <dt>Effective</dt><dd>{r.date}</dd>
                <dt>Profile</dt><dd>{r.profile}</dd>
              </dl>
            </div>
          </div>
          <div className="norm-section">
            <div className="nh">Mapping confidence</div>
            <div className="norm-card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Conf value={r.mapping} />
              <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                {r.mapping >= .85 ? "High-confidence mapping. Safe for analytics & quality measures."
                  : r.mapping >= .65 ? "Acceptable mapping. Spot-check recommended."
                  : "Below threshold. Excluded from measures until reviewed."}
              </span>
            </div>
          </div>
          <div className="norm-section">
            <div className="nh">Related resources</div>
            <div className="wrap-gap">
              {r.related.map((x, i) => <button key={i} className="chip"><Icon name="git" size={13} />{x.t}: {x.l}</button>)}
            </div>
          </div>
        </React.Fragment>;
      }
    };
  },
  patient(p: PatientRow, data?: LeafnerdData): DrawerPayload {
    const r = (data?.fhirResources.find(x => x.type === "Patient") || {}) as Partial<FhirResource>;
    return {
      kind: "patient", tag: "Patient intelligence", title: p.name,
      sub: <React.Fragment><span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{p.id}</span><span className="dotsep">·</span>{p.age}{p.sex}<span className="dotsep">·</span>{p.cohort}</React.Fragment>,
      render(tab, toast) {
        if (tab === "raw") return <JsonView data={r.json || { resourceType: "Patient", id: p.id }} />;
        if (tab === "prov") return <ProvSteps steps={[
          { t: "Identity resolved", m: `Match engine · ${Math.round(p.match * 100)}% confidence` },
          { t: "Sources merged", m: `Primary: ${p.source}` },
          { t: "Risk scored", m: `HCC ${p.hcc.toFixed(2)} + utilization model` },
          { t: "Gaps computed", m: `${p.gaps} open against 9 quality measures` },
        ]} />;
        return <React.Fragment>
          <div className="norm-section">
            <div className="nh">AI patient summary</div>
            <div className="norm-card" style={{ background: "var(--sage-tint)", borderColor: "var(--line-sage)" }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>
                {p.name} is a {p.age}-year-old with <b>{p.cohort}</b>, scored <b>{p.risk.toLowerCase()}</b> risk ({p.score.toFixed(2)}). {p.gaps > 0 ? `${p.gaps} open care gap${p.gaps > 1 ? "s" : ""} including overdue HbA1c. ` : "No open care gaps. "}Last encounter {p.lastEnc} ago.
              </div>
              <div className="m-prov" style={{ marginTop: 8 }}><Icon name="spark" size={11} /> Synthesized from {p.source} · 14 resources</div>
            </div>
          </div>
          <div className="norm-section">
            <div className="nh">Risk & identity</div>
            <div className="norm-card">
              <dl className="kv">
                <dt>Risk score</dt><dd><b>{p.score.toFixed(2)}</b> · <RiskBadge risk={p.risk} /></dd>
                <dt>HCC score</dt><dd className="tnum">{p.hcc.toFixed(2)}</dd>
                <dt>Open care gaps</dt><dd>{p.gaps}</dd>
                <dt>Identity match</dt><dd><span style={{ display: "inline-flex" }}><Conf value={p.match} /></span></dd>
                <dt>Primary source</dt><dd><Badge tone="green" dot={false}>{p.source}</Badge></dd>
              </dl>
            </div>
          </div>
          <div className="norm-section">
            <div className="nh">Risk drivers · why {p.score.toFixed(2)}</div>
            <div className="norm-card">
              <RiskDrivers p={p} />
              <div className="m-prov" style={{ marginTop: 12 }}><Icon name="layers" size={11} /> HCC v28 + utilization model · each driver's contribution to this score · refreshed 2h ago</div>
            </div>
          </div>
          <div className="norm-section">
            <div className="nh">Encounter timeline</div>
            <div className="norm-card" style={{ padding: "6px 0" }}>
              {[
                { d: p.lastEnc + " ago", t: "Office visit", s: p.source, m: "final" },
                { d: "6 wk ago", t: "Lab — HbA1c panel", s: "Riverside Lab", m: "final" },
                { d: "3 mo ago", t: "Telehealth follow-up", s: p.source, m: "final" },
              ].map((e, i) => (
                <div key={i} className="prov-step" style={{ padding: "0 16px 16px" }}>
                  <span className="prov-dot" style={{ background: "var(--indigo-soft)", color: "var(--indigo)" }}><Icon name="calendar" size={11} /></span>
                  <div>
                    <div className="ps-t">{e.t}</div>
                    <div className="ps-m">{e.d} · {e.s} · <Badge tone="green" dot={false}>{e.m}</Badge></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button className="insight-action" style={{ width: "100%", justifyContent: "center" }} onClick={() => toast("Opening full patient record…")}>
            <Icon name="eye" size={15} />Open full patient view
          </button>
        </React.Fragment>;
      }
    };
  },
  metric(m: Metric): DrawerPayload {
    return {
      kind: "metric", tag: "Metric provenance", title: m.label,
      sub: <React.Fragment><span className="tnum" style={{ fontWeight: 600, color: "var(--ink)" }}>{m.value}{m.unit}</span><span className="dotsep">·</span>{m.delta} {m.cmp}</React.Fragment>,
      render(tab) {
        if (tab === "prov") return <ProvSteps steps={[
          { t: "Source resources queried", m: `Source: ${m.prov}` },
          { t: "Aggregated", m: "Nightly batch · 02:00 UTC" },
          { t: "Compared to baseline", m: "Trailing 30-day window" },
          { t: "Published", m: "Refreshed 14 min ago" },
        ]} />;
        return <React.Fragment>
          <div className="norm-section">
            <div className="nh">Trend</div>
            <div className="norm-card"><AreaChart data={m.spark} w={400} h={150} color="var(--c-canopy)" /></div>
          </div>
          <div className="norm-section">
            <div className="nh">What this means</div>
            <div className="norm-card"><div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{m.insight}</div>
            <div className="m-prov" style={{ marginTop: 8 }}><Icon name="layers" size={11} /> Source: {m.prov}</div></div>
          </div>
        </React.Fragment>;
      }
    };
  },
  anomaly(a: Anomaly): DrawerPayload {
    return {
      kind: "anomaly", tag: "Anomaly detail", title: a.title,
      sub: <React.Fragment><Badge tone={a.sev === "high" ? "rose" : a.sev === "med" ? "amber" : "gray"} dot={false}>{a.sev} severity</Badge><span className="dotsep">·</span>{a.when}</React.Fragment>,
      render(tab, toast) {
        if (tab === "prov") return <ProvSteps steps={[
          { t: "Detected", m: `Source: ${a.source} · ${a.when}` },
          { t: "Baseline compared", m: `Confidence ${Math.round(a.confidence * 100)}%` },
          { t: "Flagged for review", m: "Routed to integration queue" },
        ]} />;
        return <React.Fragment>
          <div className="norm-section"><div className="nh">Detail</div>
            <div className="norm-card"><div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{a.detail}</div></div></div>
          <div className="norm-section"><div className="nh">Signal</div>
            <div className="norm-card"><dl className="kv">
              <dt>Resource</dt><dd><Badge tone="indigo" mono dot={false}>{a.source}</Badge></dd>
              <dt>Detection conf.</dt><dd><span style={{ display: "inline-flex" }}><Conf value={a.confidence} /></span></dd>
              <dt>First seen</dt><dd>{a.when}</dd>
            </dl></div></div>
          <ImpactList items={a.impact} />
          <button className="insight-action" style={{ width: "100%", justifyContent: "center" }} onClick={() => toast("Incident opened · integration team notified")}>
            <Icon name="bolt" size={15} />Open incident
          </button>
        </React.Fragment>;
      }
    };
  },
  insight(ins: Insight): DrawerPayload {
    return {
      kind: "insight", tag: "AI insight · receipts", title: ins.finding,
      sub: <React.Fragment><Badge tone={ins.conf >= .85 ? "green" : "amber"} dot={false}>{ins.confidence} confidence</Badge><span className="dotsep">·</span>{Math.round(ins.conf * 100)}%</React.Fragment>,
      render(tab, toast) {
        if (tab === "prov") return <ProvSteps steps={[
          { t: "Signals gathered", m: ins.source },
          { t: "Model reasoning", m: "Cohort comparison vs. 90-day baseline" },
          { t: "Evidence assembled", m: `${ins.evidence.length} resource groups` },
          { t: "Recommendation ranked", m: `Impact-scored · action affects ${ins.actionCount}` },
        ]} />;
        return <React.Fragment>
          <div className="norm-section"><div className="nh">Why it matters</div>
            <div className="norm-card"><div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{ins.why}</div></div></div>
          <div className="norm-section"><div className="nh">Evidence ({ins.evidence.length})</div>
            <div className="norm-card"><div className="wrap-gap">{ins.evidence.map((e, i) => <Badge key={i} tone="indigo" mono dot={false}>{e}</Badge>)}</div>
            <div className="m-prov" style={{ marginTop: 10 }}><Icon name="layers" size={11} /> {ins.source}</div></div></div>
          <ImpactList items={ins.impact} />
          <div className="norm-section"><div className="nh">Recommended action</div>
            <button className="insight-action" style={{ width: "100%", justifyContent: "center" }} onClick={() => toast(`Queued: ${ins.action}`)}>
              <Icon name="bolt" size={15} />{ins.action}
            </button></div>
        </React.Fragment>;
      }
    };
  },
};
