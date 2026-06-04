"use client";
/* LEAFNERD — Executive Overview */
import { Icon, Badge, Sparkline, Gauge, BarsH, AreaChart } from "./primitives";
import { InsightCard, PatientTable } from "./widgets";
import { DEMO_DATA } from "@/lib/leafnerd/analytics";
import type { LeafnerdData, Metric, Insight, Anomaly, PatientRow } from "@/lib/leafnerd/types";

export type OpenDrawer = {
  metric: (m: Metric) => void;
  insight: (i: Insight) => void;
  anomaly: (a: Anomaly) => void;
  patient: (p: PatientRow) => void;
};

function MetricCard({ m, onOpen }: { m: Metric; onOpen: (m: Metric) => void }) {
  const toneColor = { green: "var(--canopy)", amber: "var(--amber)", rose: "var(--rose)" }[m.tone];
  const toneBg = { green: "var(--canopy-soft)", amber: "var(--amber-soft)", rose: "var(--rose-soft)" }[m.tone];
  const dirIc = m.dir === "up" ? "arrowUp" : m.dir === "down" ? "arrowDown" : "arrowR";
  const deltaClass = m.good ? "up" : (m.dir === "up" ? (m.tone === "rose" ? "down" : "up") : "down");
  return (
    <div className="card lift metric" onClick={() => onOpen(m)}>
      <div className="m-top">
        <span className="m-ic" style={{ background: toneBg, color: toneColor }}><Icon name={m.icon} size={15} /></span>
        <span className="m-label">{m.label}</span>
        <span style={{ marginLeft: "auto" }}><Sparkline data={m.spark} color={toneColor} w={64} h={24} /></span>
      </div>
      <div className="m-val tnum">{m.value}{m.unit && <span className="unit">{m.unit}</span>}</div>
      <div className={`m-delta ${deltaClass}`}>
        <Icon name={dirIc} size={13} />{m.delta} <span className="cmp">{m.cmp}</span>
      </div>
      <div className="m-insight">{m.insight}</div>
      <div className="m-prov"><Icon name="layers" size={11} /> Source: {m.prov}</div>
    </div>
  );
}

function AnomalyRow({ a, onOpen }: { a: Anomaly; onOpen: (a: Anomaly) => void }) {
  const tone = a.sev === "high" ? "rose" : a.sev === "med" ? "amber" : "gray";
  return (
    <div className="between" style={{ padding: "12px 2px", borderBottom: "1px solid var(--line-soft)", cursor: "pointer", gap: 14 }}
      onClick={() => onOpen(a)}>
      <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
        <span style={{ marginTop: 2, flex: "none", color: tone === "rose" ? "var(--rose)" : tone === "amber" ? "var(--amber)" : "var(--muted)" }}>
          <Icon name={a.sev === "low" ? "info" : "alert"} size={17} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 540, lineHeight: 1.35, textWrap: "pretty" }}>{a.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <Badge tone="indigo" mono dot={false}>{a.source}</Badge>
            <span className="mono">conf {Math.round(a.confidence * 100)}%</span>
            <span className="dotsep">·</span>{a.when}
          </div>
        </div>
      </div>
      <span className="row-action" style={{ opacity: .5, flex: "none" }}><Icon name="chevR" size={16} /></span>
    </div>
  );
}

function OppRow({ o }: { o: LeafnerdData["opportunities"][number] }) {
  return (
    <div style={{ padding: "11px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <div className="between" style={{ gap: 10, alignItems: "flex-start" }}>
        <div style={{ fontSize: 13, fontWeight: 540, lineHeight: 1.35, textWrap: "pretty" }}>{o.title}</div>
        <span className="tnum" style={{ fontSize: 12, fontWeight: 600, color: "var(--canopy)", flex: "none" }}>{o.value}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 11.5, color: "var(--ink-2)" }}>{o.impact}</span>
        <span className="dotsep">·</span>
        <Badge tone={o.effort === "Low" ? "green" : "amber"} dot={false}>{o.effort} effort</Badge>
      </div>
    </div>
  );
}

export function OverviewSurface({ data = DEMO_DATA, openDrawer, toast }: { data?: LeafnerdData; openDrawer: OpenDrawer; toast: (m: string) => void }) {
  const D = data;
  const volLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const volData = [1.21, 1.30, 1.28, 1.44, 1.66, 1.84];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Executive Overview</div>
          <h1 className="page-title">Population & data health</h1>
          <p className="page-lede">A single aperture across 48,210 patients, seven clinical domains, and 2.4M FHIR resources — with provenance on every number.</p>
        </div>
        <div className="page-head-actions">
          <button className="cmd-ctrl" onClick={() => toast("Generating executive brief (PDF) — population & data health…")}><Icon name="download" size={15} />Export brief</button>
          <button className="cmd-ctrl" onClick={() => toast("Time range — showing the last 30 days")}><Icon name="clock" size={15} /><b>Last 30 days</b><Icon name="chevD" size={13} /></button>
        </div>
      </div>

      <div className="headline">
        <span className="hl-ic"><Icon name="spark" size={19} /></span>
        <div>
          <div className="hl-txt"><b>Data completeness rose to 92.4%</b> this period, but a new Northbay feed left <b>312 medication records unmapped</b> and Riverside Lab volume fell 41% overnight — two items worth attention before they affect quality scores.</div>
          <div className="hl-meta">Generated by Leafnerd AI · synthesizes 5 signals · refreshed 14 min ago</div>
        </div>
      </div>

      <div className="grid g-5">
        {D.metrics.map(m => <MetricCard key={m.id} m={m} onOpen={openDrawer.metric} />)}
      </div>

      <div className="grid g-3" style={{ marginTop: 16 }}>
        <div className="card span-2 card-pad">
          <div className="between" style={{ marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-.01em" }}>Clinical data volume</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>FHIR resources ingested per month (millions)</div>
            </div>
            <Badge tone="green" dot={false}>+18% MoM</Badge>
          </div>
          <AreaChart data={volData} labels={volLabels} w={620} h={188} yMax={2.0} />
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 6, paddingTop: 12, borderTop: "1px solid var(--line-soft)" }}>
            <span style={{ color: "var(--canopy)", flex: "none", marginTop: 1 }}><Icon name="trendUp" size={16} /></span>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
              Lab observations increased <b>18%</b> after onboarding Northbay Clinic. Growth is healthy but concentrated — monitor mapping quality on the new source.
              <span className="m-prov" style={{ marginTop: 6 }}><Icon name="layers" size={11} /> Source: Observation, Encounter, MedicationRequest, Condition</span>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-.01em" }}>Data completeness</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "12px 0 16px" }}>
            <Gauge value={92} label="overall" />
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
              6 of 7 domains exceed 85%. <b>Social history</b> lags at 61% and caps the composite score.
            </div>
          </div>
          <BarsH data={D.domains} />
        </div>
      </div>

      <div className="sec-title">
        <h2>AI Insights</h2><span className="count">3 active</span>
        <span className="link" onClick={() => toast("Opening AI Insights workspace…")}>View all<Icon name="arrowR" size={14} /></span>
      </div>
      <div className="grid g-3">
        {D.insights.map(ins => <InsightCard key={ins.id} ins={ins} onEvidence={openDrawer.insight} toast={toast} />)}
      </div>

      <div className="grid g-3" style={{ marginTop: 24 }}>
        <div className="card span-2 card-pad">
          <div className="between">
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>Recent anomalies</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Deviations from expected ingestion & data patterns</div>
            </div>
            <Badge tone="rose">1 high</Badge>
          </div>
          <div style={{ marginTop: 6 }}>
            {D.anomalies.map(a => <AnomalyRow key={a.id} a={a} onOpen={openDrawer.anomaly} />)}
          </div>
        </div>

        <div className="card card-pad">
          <div className="between" style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Top opportunities</div>
            <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>impact ↓</span>
          </div>
          {D.opportunities.map(o => <OppRow key={o.id} o={o} />)}
        </div>
      </div>

      {/* Data freshness */}
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="between" style={{ marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Data freshness · last 24 hours</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Ingestion throughput per hour, relative to baseline</div>
          </div>
          <div className="wrap-gap">
            <Badge tone="green">On time</Badge><Badge tone="amber">Slow</Badge><Badge tone="rose">Gap</Badge>
          </div>
        </div>
        <div className="fresh">
          {D.freshness.map((f, i) => <div key={i} className={`bar ${f.state === "ok" ? "" : f.state}`} style={{ height: Math.max(4, f.v * 0.56) + "px" }} title={`${String(f.h).padStart(2, '0')}:00 — ${f.v}%`}></div>)}
        </div>
        <div className="between" style={{ marginTop: 8, fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--mono)" }}>
          <span>00:00</span><span style={{ color: "var(--rose)" }}>↓ 15:00 Riverside gap</span><span>23:00</span>
        </div>
      </div>

      {/* High-risk patients table */}
      <div className="sec-title">
        <h2>High-risk cohort</h2><span className="count">1,206 patients</span>
        <span className="link" onClick={() => toast("Opening cohort in Analytics Workbench…")}>Open in Analytics<Icon name="arrowR" size={14} /></span>
      </div>
      <PatientTable patients={D.patients} onOpen={openDrawer.patient} toast={toast} />
    </div>
  );
}
