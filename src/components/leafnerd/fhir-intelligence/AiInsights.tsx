"use client";
/* LEAFNERD — AI Insights surface ("a smart analyst, with receipts") */
import { Icon } from "./primitives";
import { InsightCard } from "./widgets";
import { DEMO_DATA } from "@/lib/leafnerd/analytics";
import type { LeafnerdData, Insight } from "@/lib/leafnerd/types";

export function AiInsightsSurface({
  data = DEMO_DATA,
  openDrawer,
  toast,
}: {
  data?: LeafnerdData;
  openDrawer: { insight: (i: Insight) => void };
  toast: (m: string) => void;
}) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">AI Insights</div>
          <h1 className="page-title">A smart analyst, with receipts</h1>
          <p className="page-lede">Every finding shows why it matters, the evidence behind it, a recommended action, and a confidence level. No magic — just traceable reasoning over your FHIR data.</p>
        </div>
        <div className="page-head-actions">
          <button className="cmd-ctrl"><Icon name="filter" size={15} />All types<Icon name="chevD" size={13} /></button>
        </div>
      </div>
      <div className="grid g-3" style={{ marginTop: 18 }}>
        {data.insights.map(ins => <InsightCard key={ins.id} ins={ins} onEvidence={openDrawer.insight} toast={toast} />)}
      </div>
      <div className="sec-title"><h2>How Leafnerd reasons</h2></div>
      <div className="grid g-3">
        {[
          { ic: "layers", t: "Grounded in FHIR", d: "Findings cite the exact Observation, Condition, and Encounter resources behind them." },
          { ic: "shield", t: "Confidence, always", d: "Every recommendation carries a calibrated confidence and the baseline it was measured against." },
          { ic: "git", t: "Traceable lineage", d: "Open any insight to walk the lineage from raw source feed to published recommendation." },
        ].map((c, i) => (
          <div key={i} className="card card-pad">
            <span className="m-ic" style={{ background: "var(--indigo-soft)", color: "var(--indigo)", width: 30, height: 30 }}><Icon name={c.ic} size={16} /></span>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 12 }}>{c.t}</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, marginTop: 6 }}>{c.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
