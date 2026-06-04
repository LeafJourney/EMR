"use client";
/* LEAFNERD — Intelligence · Quality measures (HEDIS / CMS gap closure) */
import React from "react";
import { Icon, Badge, Sparkline, Gauge } from "./primitives";
import type { QualityMeasureRow } from "@/lib/leafnerd/types";

/**
 * QualitySurface — HEDIS/CMS-style quality-measure gap closure.
 *
 * Per the cardinal resilience rule, this renders fully with zero props: when
 * `rows` is absent or empty we fall back to a curated set of ~6 believable
 * measures. Every number carries provenance (steward + numerator/denominator)
 * and a per-measure "Generate outreach list" action queues outreach for the
 * reachable patients on that gap list.
 */

const FALLBACK: QualityMeasureRow[] = [
  {
    id: "qm-cdc-hba1c",
    measure: "Comprehensive Diabetes Care — HbA1c control (<8%)",
    abbrev: "CDC-HbA1c",
    steward: "HEDIS",
    rate: 0.71,
    target: 0.78,
    numerator: 1342,
    denominator: 1890,
    gaps: 548,
    reachable: 411,
    trend: [0.63, 0.65, 0.66, 0.68, 0.69, 0.71],
    status: "near",
  },
  {
    id: "qm-cdc-eye",
    measure: "Comprehensive Diabetes Care — diabetic eye exam",
    abbrev: "CDC-Eye",
    steward: "HEDIS",
    rate: 0.58,
    target: 0.72,
    numerator: 1096,
    denominator: 1890,
    gaps: 794,
    reachable: 503,
    trend: [0.61, 0.6, 0.59, 0.58, 0.57, 0.58],
    status: "behind",
  },
  {
    id: "qm-cbp",
    measure: "Controlling High Blood Pressure (<140/90)",
    abbrev: "CBP",
    steward: "NCQA",
    rate: 0.74,
    target: 0.7,
    numerator: 1612,
    denominator: 2178,
    gaps: 566,
    reachable: 388,
    trend: [0.68, 0.69, 0.71, 0.72, 0.73, 0.74],
    status: "ahead",
  },
  {
    id: "qm-col",
    measure: "Colorectal Cancer Screening",
    abbrev: "COL",
    steward: "HEDIS",
    rate: 0.66,
    target: 0.71,
    numerator: 2024,
    denominator: 3067,
    gaps: 1043,
    reachable: 712,
    trend: [0.6, 0.62, 0.63, 0.64, 0.65, 0.66],
    status: "near",
  },
  {
    id: "qm-supd",
    measure: "Statin Use in Persons with Diabetes",
    abbrev: "SUPD",
    steward: "CMS",
    rate: 0.81,
    target: 0.8,
    numerator: 1531,
    denominator: 1890,
    gaps: 359,
    reachable: 247,
    trend: [0.76, 0.77, 0.78, 0.79, 0.8, 0.81],
    status: "ahead",
  },
  {
    id: "qm-amm",
    measure: "Antidepressant Medication Management — continuation",
    abbrev: "AMM",
    steward: "HEDIS",
    rate: 0.49,
    target: 0.64,
    numerator: 402,
    denominator: 820,
    gaps: 418,
    reachable: 296,
    trend: [0.54, 0.52, 0.51, 0.5, 0.49, 0.49],
    status: "behind",
  },
];

const STATUS: Record<
  QualityMeasureRow["status"],
  { tone: string; label: string; color: string }
> = {
  ahead: { tone: "green", label: "Ahead of target", color: "var(--c-canopy)" },
  near: { tone: "amber", label: "Near target", color: "var(--c-amber)" },
  behind: { tone: "rose", label: "Behind target", color: "var(--rose)" },
};

const STEWARD_TONE: Record<string, string> = {
  HEDIS: "indigo",
  CMS: "indigo",
  NCQA: "indigo",
};

function pct(v: number): number {
  return Math.round(v * 100);
}

function MeasureCard({
  m,
  onOutreach,
}: {
  m: QualityMeasureRow;
  onOutreach: (m: QualityMeasureRow) => void;
}) {
  const s = STATUS[m.status];
  const ratePct = pct(m.rate);
  const targetPct = pct(m.target);
  const targetPos = `${Math.min(100, Math.max(0, targetPct))}%`;

  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* header: name + steward */}
      <div className="between" style={{ alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-.01em", lineHeight: 1.3, textWrap: "pretty" }}>
            {m.measure}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, flexWrap: "wrap" }}>
            <Badge tone="gray" mono dot={false}>{m.abbrev}</Badge>
            <Badge tone={STEWARD_TONE[m.steward] ?? "indigo"} dot={false}>{m.steward}</Badge>
          </div>
        </div>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>

      {/* rate gauge + rate-vs-target bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Gauge value={ratePct} label="rate" color={s.color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="between" style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 5 }}>
            <span>Rate vs target</span>
            <span className="tnum">target {targetPct}%</span>
          </div>
          {/* progress bar with a target marker tick */}
          <div style={{ position: "relative", height: 8, background: "var(--cream-deep)", borderRadius: 5, overflow: "visible" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: ratePct + "%", height: "100%", background: s.color, borderRadius: 5, transition: "width .7s ease" }}></div>
            </div>
            <span
              title={`Target ${targetPct}%`}
              style={{ position: "absolute", top: -3, left: targetPos, width: 2, height: 14, background: "var(--ink)", borderRadius: 2, transform: "translateX(-1px)" }}
            ></span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 10 }}>
            <div>
              <div className="tnum" style={{ fontSize: 12.5, fontWeight: 550, color: "var(--ink)" }}>
                {m.numerator.toLocaleString()} / {m.denominator.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>num / denom</div>
            </div>
            <Sparkline data={m.trend} color={s.color} w={84} h={28} />
          </div>
        </div>
      </div>

      {/* gap + reachable footers */}
      <div className="between" style={{ paddingTop: 12, borderTop: "1px solid var(--line-soft)", gap: 10 }}>
        <div style={{ display: "flex", gap: 18 }}>
          <div>
            <div className="tnum" style={{ fontSize: 15, fontWeight: 600, color: m.gaps > 0 ? "var(--rose)" : "var(--ink)", lineHeight: 1 }}>
              {m.gaps.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>open gaps</div>
          </div>
          <div>
            <div className="tnum" style={{ fontSize: 15, fontWeight: 600, color: "var(--canopy)", lineHeight: 1 }}>
              {m.reachable.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>reachable</div>
          </div>
        </div>
        <button className="cmd-ctrl" onClick={() => onOutreach(m)}>
          <Icon name="users" size={14} />
          Generate outreach list
        </button>
      </div>
    </div>
  );
}

export function QualitySurface({
  rows,
  toast,
}: {
  rows?: QualityMeasureRow[];
  toast?: (m: string) => void;
}) {
  const data = rows && rows.length ? rows : FALLBACK;

  const totalGaps = data.reduce((sum, m) => sum + m.gaps, 0);
  const behind = data.filter((m) => m.status === "behind").length;
  const reachable = data.reduce((sum, m) => sum + m.reachable, 0);

  const outreach = (m: QualityMeasureRow) =>
    toast?.(`Queued outreach for ${m.reachable.toLocaleString()} reachable patients — ${m.abbrev}…`);

  const outreachAll = () =>
    toast?.(`Queued outreach for ${reachable.toLocaleString()} reachable patients across ${data.length} measures…`);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Intelligence</div>
          <h1 className="page-title">Quality measures</h1>
          <p className="page-lede">
            HEDIS and CMS Star gap closure across the managed population — current rate against
            benchmark, open care gaps, and the reachable patients behind each one, with steward
            and numerator/denominator provenance on every measure.
          </p>
        </div>
        <div className="page-head-actions">
          <button className="cmd-ctrl" onClick={outreachAll}>
            <Icon name="bolt" size={15} />Generate all outreach
          </button>
          <button className="cmd-ctrl" onClick={() => toast?.("Exporting quality-measure brief…")}>
            <Icon name="download" size={15} />Export brief
          </button>
        </div>
      </div>

      {/* summary strip */}
      <div className="grid g-3" style={{ marginTop: 8 }}>
        <div className="card card-pad">
          <div className="between">
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Total open gaps</span>
            <span style={{ color: "var(--rose)" }}><Icon name="target" size={16} /></span>
          </div>
          <div className="tnum" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-.025em", marginTop: 6 }}>
            {totalGaps.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>
            across {data.length} tracked measures
          </div>
        </div>
        <div className="card card-pad">
          <div className="between">
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Measures behind target</span>
            <span style={{ color: behind > 0 ? "var(--amber)" : "var(--canopy)" }}><Icon name="activity" size={16} /></span>
          </div>
          <div className="tnum" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-.025em", marginTop: 6 }}>
            {behind}<span style={{ fontSize: 16, color: "var(--muted)", fontWeight: 500 }}> / {data.length}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>
            below benchmark this period
          </div>
        </div>
        <div className="card card-pad">
          <div className="between">
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Reachable for outreach</span>
            <span style={{ color: "var(--canopy)" }}><Icon name="users" size={16} /></span>
          </div>
          <div className="tnum" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-.025em", marginTop: 6 }}>
            {reachable.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>
            patients with valid contact + open gap
          </div>
        </div>
      </div>

      <div className="sec-title">
        <h2>Measures</h2>
        <span className="count">{data.length} tracked</span>
        <span className="link" onClick={outreachAll}>
          Generate all outreach<Icon name="arrowR" size={14} />
        </span>
      </div>

      <div className="grid g-3">
        {data.map((m) => (
          <MeasureCard key={m.id} m={m} onOutreach={outreach} />
        ))}
      </div>
    </div>
  );
}

export default QualitySurface;
