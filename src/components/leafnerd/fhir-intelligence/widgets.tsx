"use client";
/* LEAFNERD — shared widgets: InsightCard, PatientTable, RiskBadge, Overview charts */
import React from "react";
import { Icon, Badge, Conf } from "./primitives";
import type { DomainCompleteness, Insight, PatientRow, RiskLevel } from "@/lib/leafnerd/types";

// ---------------------------------------------------------------------------
// Interactive Overview charts (clinical volume + domain completeness).
//
// The geometry below is pure (no DOM, no React) so it can be unit-tested and
// shared between the rendered <path> and the hover hit-testing. The charts
// render genuine inline SVG paths — no static mockups — and surface the exact
// underlying numbers on hover.
// ---------------------------------------------------------------------------

export interface ChartGeom {
  w: number;
  h: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
}

export interface ChartPoint {
  x: number;
  y: number;
  v: number;
  i: number;
}

/**
 * Compute the SVG geometry for a value series: the plotted points, the line
 * path, the closed area path, and the baseline y. Pure — exported for tests.
 *
 * A single-point series is centered horizontally; an empty series yields no
 * points and an empty area path (callers render nothing).
 */
export function buildChartGeometry(
  data: number[],
  geom: ChartGeom,
  yMax?: number,
): { points: ChartPoint[]; line: string; area: string; baseY: number; max: number } {
  const iw = geom.w - geom.padL - geom.padR;
  const ih = geom.h - geom.padT - geom.padB;
  const baseY = geom.padT + ih;
  const max = yMax ?? (data.length ? Math.max(...data) * 1.12 : 1);
  const span = max || 1; // min is fixed at 0
  const X = (i: number) =>
    geom.padL + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const Y = (v: number) => geom.padT + ih - (v / span) * ih;
  const points: ChartPoint[] = data.map((v, i) => ({ x: X(i), y: Y(v), v, i }));
  const line = points
    .map((p, i) => (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1))
    .join(" ");
  const area = points.length
    ? `${line} L${points[points.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} L${points[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`
    : "";
  return { points, line, area, baseY, max };
}

/**
 * Index of the data point whose x is nearest the cursor x (both in viewBox
 * units). Returns -1 for an empty series. Pure — exported for tests.
 */
export function nearestPointIndex(x: number, points: { x: number }[]): number {
  if (!points.length) return -1;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = Math.abs(points[i].x - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Interactive area/line chart. Renders inline SVG paths from `data` and shows a
 * crosshair + floating tooltip (label + exact value) tracking the nearest point
 * under the cursor.
 */
export function VolumeChart({
  data,
  labels = [],
  w = 620,
  h = 188,
  yMax,
  color = "var(--c-canopy)",
  formatValue = (v) => String(v),
  ariaLabel = "Clinical data volume",
}: {
  data: number[];
  labels?: string[];
  w?: number;
  h?: number;
  yMax?: number;
  color?: string;
  formatValue?: (v: number, i: number) => string;
  ariaLabel?: string;
}) {
  const rawId = React.useId();
  const id = rawId.replace(/:/g, "");
  const geom: ChartGeom = { w, h, padL: 4, padR: 4, padT: 10, padB: 22 };
  const { points, line, area, baseY } = buildChartGeometry(data, geom, yMax);
  const [hover, setHover] = React.useState<number | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const grid = [0, 0.5, 1];
  const ih = h - geom.padT - geom.padB;

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el || !points.length) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const relX = ((e.clientX - rect.left) / rect.width) * w;
    setHover(nearestPointIndex(relX, points));
  };

  const hv = hover != null ? points[hover] : null;
  const leftPct = hv ? Math.min(93, Math.max(7, (hv.x / w) * 100)) : 0;

  return (
    <div
      ref={wrapRef}
      className="ln-chart"
      style={{ position: "relative" }}
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {grid.map((g, i) => {
          const y = geom.padT + ih * g;
          return (
            <line key={i} x1={geom.padL} y1={y} x2={w - geom.padR} y2={y} stroke="var(--c-grid)" strokeWidth="1" strokeDasharray={i === 2 ? "0" : "3 4"} />
          );
        })}
        {area && <path d={area} fill={`url(#${id})`} />}
        {line && <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        {hv && <line x1={hv.x} y1={geom.padT} x2={hv.x} y2={baseY} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />}
        {points.map((p) => (
          <circle key={p.i} cx={p.x} cy={p.y} r={hover === p.i ? 4 : 2.4} fill={hover === p.i ? color : "var(--paper)"} stroke={color} strokeWidth="1.6" />
        ))}
        {labels.map((l, i) =>
          points[i] ? (
            <text key={i} x={points[i].x} y={h - 6} fontSize="10.5" fill={hover === i ? "var(--ink)" : "var(--muted)"} textAnchor="middle" fontFamily="var(--mono)">
              {l}
            </text>
          ) : null,
        )}
      </svg>
      {hv && (
        <div className="ln-chart-tip" style={{ left: `${leftPct}%`, top: `${(hv.y / h) * 100}%` }}>
          {labels[hover as number] && <span className="t">{labels[hover as number]}</span>}
          <span className="v tnum">{formatValue(hv.v, hover as number)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Interactive horizontal completeness bars. Mirrors the static `BarsH` look but
 * highlights the hovered domain and floats a tooltip with the exact percentage
 * and where it sits against the 85% target.
 */
export function DomainBars({ data }: { data: DomainCompleteness[] }) {
  const [hover, setHover] = React.useState<number | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map((d, i) => {
        const color = d.pct >= 85 ? "var(--c-canopy)" : d.pct >= 70 ? "var(--c-sage)" : "var(--c-amber)";
        const status = d.pct >= 85 ? "meets 85% target" : d.pct >= 70 ? "below 85% target" : "lags — caps composite score";
        const on = hover === i;
        return (
          <div
            key={i}
            className="ln-bar-row"
            style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover((h) => (h === i ? null : h))}
          >
            <div style={{ width: 104, fontSize: 12.5, color: on ? "var(--ink)" : "var(--ink-2)", flex: "none", transition: "color .12s" }}>{d.name}</div>
            <div style={{ flex: 1, height: 8, background: "var(--cream-deep)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: d.pct + "%", height: "100%", background: color, borderRadius: 5, transition: "width .7s ease, filter .12s", filter: on ? "brightness(1.08)" : "none" }} />
            </div>
            <div className="tnum" style={{ width: 34, textAlign: "right", fontSize: 12.5, fontWeight: 550, color: d.pct < 70 ? "var(--amber)" : "var(--ink)" }}>{d.pct}%</div>
            {on && (
              <div className="ln-chart-tip ln-bar-tip">
                <span className="t">{d.name}</span>
                <span className="v tnum">{d.pct}% complete</span>
                <span className="s">{status}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const map: Record<string, "rose" | "amber" | "green"> = { Critical: "rose", High: "rose", Moderate: "amber", Low: "green" };
  return <Badge tone={map[risk] || "gray"}>{risk}</Badge>;
}

export function InsightCard({ ins, onEvidence, toast }: { ins: Insight; onEvidence: (i: Insight) => void; toast: (m: string) => void }) {
  const kindMap = {
    risk:    { ic: "pulse",  bg: "var(--rose-soft)",   fg: "var(--rose)",   label: "Risk signal" },
    quality: { ic: "check",  bg: "var(--canopy-soft)", fg: "var(--canopy)", label: "Quality opportunity" },
    data:    { ic: "layers", bg: "var(--indigo-soft)", fg: "var(--indigo)", label: "Data integrity" },
  };
  const k = kindMap[ins.kind];
  const confTone = ins.conf >= 0.85 ? "green" : ins.conf >= 0.7 ? "amber" : "gray";
  return (
    <div className="card lift insight">
      <div className="insight-head">
        <span className="insight-kind" style={{ background: k.bg, color: k.fg }}><Icon name={k.ic} size={16} /></span>
        <span className="t">{k.label}</span>
        <span style={{ marginLeft: "auto" }}><Badge tone={confTone} dot={false}>{ins.confidence} confidence</Badge></span>
      </div>
      <div className="insight-body">
        <p className="insight-finding">{ins.finding}</p>
        <div className="insight-row">
          <span className="lbl">Why it matters</span>
          <span className="val">{ins.why}</span>
        </div>
        <div className="insight-row">
          <span className="lbl">Evidence</span>
          <span className="val">
            <div className="evidence-pills">
              {ins.evidence.map((e, i) => <Badge key={i} tone="gray" mono dot={false}>{e}</Badge>)}
            </div>
          </span>
        </div>
      </div>
      <div className="insight-foot">
        <button className="insight-action" onClick={() => toast(`Queued: ${ins.action}`)}>
          <Icon name="bolt" size={14} />{ins.action}
        </button>
        <span className="dismiss" onClick={() => onEvidence(ins)}>Show receipts</span>
      </div>
    </div>
  );
}

export function PatientTable({ patients, onOpen, toast }: { patients: PatientRow[]; onOpen: (p: PatientRow) => void; toast?: (m: string) => void }) {
  const [dense, setDense] = React.useState(false);
  const [riskFilter, setRiskFilter] = React.useState(true);
  const [sort, setSort] = React.useState<{ key: keyof PatientRow; dir: number }>({ key: "score", dir: -1 });
  const filtered = riskFilter ? patients.filter(p => p.risk !== "Low") : patients;
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key];
    return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
  });
  const setSortKey = (k: keyof PatientRow) => setSort(s => s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: -1 });
  const caret = (k: keyof PatientRow) => sort.key === k ? (sort.dir === 1 ? "▲" : "▼") : "↕";
  const cols: { k: keyof PatientRow; t: string; num?: boolean }[] = [
    { k: "name", t: "Patient" }, { k: "cohort", t: "Cohort" }, { k: "risk", t: "Risk" },
    { k: "score", t: "Risk score", num: true }, { k: "hcc", t: "HCC", num: true },
    { k: "gaps", t: "Care gaps", num: true }, { k: "source", t: "Source" },
    { k: "match", t: "Identity", num: true }, { k: "lastEnc", t: "Last enc." },
  ];
  return (
    <div className="tbl-wrap">
      <div className="tbl-tools">
        {riskFilter
          ? <button className="chip on" onClick={() => setRiskFilter(false)} title="Remove filter">Risk ≥ Moderate <span className="x">×</span></button>
          : <button className="chip" onClick={() => setRiskFilter(true)}><Icon name="filter" size={13} />Risk ≥ Moderate</button>}
        <button className="chip" onClick={() => toast?.("Filter builder — add risk, cohort, source, or gap conditions")}><Icon name="plus" size={13} />Add filter</button>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{sorted.length} of {patients.length}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Density</span>
          <div className="density-toggle">
            <button className={!dense ? "on" : ""} onClick={() => setDense(false)}>Comfortable</button>
            <button className={dense ? "on" : ""} onClick={() => setDense(true)}>Compact</button>
          </div>
          <button className="cmd-ctrl" style={{ height: 30 }} onClick={() => toast?.(`Exporting ${sorted.length} patients (CSV) — de-identified cohort`)}><Icon name="download" size={14} />Export</button>
        </div>
      </div>
      <div className="tbl-scroll">
        <table className={`tbl ${dense ? "dense" : ""}`}>
          <thead>
            <tr>
              {cols.map(c => <th key={c.k} onClick={() => setSortKey(c.k)} style={{ textAlign: c.num ? "right" : "left" }}>
                {c.t}<span className="sortcaret">{caret(c.k)}</span>
              </th>)}
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.id} onClick={() => onOpen(p)}>
                <td>
                  <div className="pt-name">{p.name}</div>
                  <div className="pt-id">{p.id} · {p.age}{p.sex}</div>
                </td>
                <td><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{p.cohort}</span></td>
                <td><RiskBadge risk={p.risk} /></td>
                <td style={{ textAlign: "right" }} className="tnum"><b style={{ fontWeight: 600 }}>{p.score.toFixed(2)}</b></td>
                <td style={{ textAlign: "right" }} className="tnum">{p.hcc.toFixed(2)}</td>
                <td style={{ textAlign: "right" }} className="tnum">{p.gaps > 0 ? <span style={{ color: p.gaps >= 3 ? "var(--amber)" : "var(--ink)" }}>{p.gaps}</span> : <span className="muted">0</span>}</td>
                <td><Badge tone={p.source === "EHR" ? "green" : p.source === "Claims" ? "indigo" : p.source === "Wearable" ? "amber" : "gray"} dot={false}>{p.source}</Badge></td>
                <td style={{ textAlign: "right" }}><div style={{ display: "inline-flex" }}><Conf value={p.match} showPct={false} /></div></td>
                <td><span className="muted" style={{ fontSize: 12.5 }}>{p.lastEnc} ago</span></td>
                <td><span className="row-action"><Icon name="chevR" size={15} /></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
