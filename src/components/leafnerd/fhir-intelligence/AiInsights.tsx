"use client";
/* LEAFNERD — AI Insights surface ("a smart analyst, with receipts") */
import React from "react";
import { Icon } from "./primitives";
import { InsightCard } from "./widgets";
import { DEMO_DATA } from "@/lib/leafnerd/analytics";
import type { LeafnerdData, Insight, InsightKind } from "@/lib/leafnerd/types";

type Filter = "all" | InsightKind;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All types" },
  { id: "risk", label: "Risk" },
  { id: "quality", label: "Quality" },
  { id: "data", label: "Data integrity" },
];

export function AiInsightsSurface({
  data = DEMO_DATA,
  openDrawer,
  toast,
}: {
  data?: LeafnerdData;
  openDrawer: { insight: (i: Insight) => void };
  toast: (m: string) => void;
}) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const count = (f: Filter) => (f === "all" ? data.insights.length : data.insights.filter((i) => i.kind === f).length);
  const shown = filter === "all" ? data.insights : data.insights.filter((i) => i.kind === filter);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">AI Insights</div>
          <h1 className="page-title">A smart analyst, with receipts</h1>
          <p className="page-lede">Every finding shows why it matters, the evidence behind it, a recommended action, and a confidence level. No magic — just traceable reasoning over your FHIR data.</p>
        </div>
        <div className="page-head-actions">
          <button className="cmd-ctrl" onClick={() => toast("Refreshing insights against the latest FHIR snapshot…")}>
            <Icon name="spark" size={15} />Refresh
          </button>
        </div>
      </div>

      <div className="wrap-gap" style={{ marginTop: 16 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`chip${filter === f.id ? " on" : ""}`}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
          >
            {f.label}
            <span className="tnum" style={{ fontSize: 11, opacity: 0.72, fontFamily: "var(--mono)" }}>{count(f.id)}</span>
          </button>
        ))}
      </div>

      <div className="grid g-3" style={{ marginTop: 14 }}>
        {shown.map(ins => <InsightCard key={ins.id} ins={ins} onEvidence={openDrawer.insight} toast={toast} />)}
      </div>
      {shown.length === 0 && (
        <div className="empty" style={{ minHeight: "30vh" }}>
          <div>
            <div className="e-ic"><Icon name="spark" size={28} /></div>
            <h3>No {filter} insights right now</h3>
            <p>Leafnerd surfaces findings only when the evidence clears its confidence threshold. Nothing in this category is actionable today.</p>
          </div>
        </div>
      )}

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
