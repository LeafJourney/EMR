"use client";
/* ─────────────────────────────────────────────────────────────────────────
   LEAFNERD — Intelligence · Risk stratification

   A population-health risk command center built for an analyst who distrusts
   black boxes: a tier distribution that reconciles to the panel (48,210 →
   1,206 high-risk → 42 newly rising), an explainable population-level driver
   decomposition (what is actually pushing people into high risk, with
   contribution weights and the resources behind each), and a stratified
   cohort table that drills into per-patient risk drivers via the global drawer.

   Self-contained & SSR-safe (no Math.random / Date.now); reuses the existing
   PatientTable + botanical theme classes. Every number carries provenance and
   names the model that produced it.
   ──────────────────────────────────────────────────────────────────────── */
import React from "react";
import { Icon, Badge, Sparkline } from "./primitives";
import { PatientTable } from "./widgets";
import { DEMO_DATA } from "@/lib/leafnerd/analytics";
import type { PatientRow } from "@/lib/leafnerd/types";

// ── Tiers (counts reconcile: 312+894+3,320+8,140+35,544 = 48,210; Critical+High
//    = 1,206 "high-risk cohort"; Rising = 3,320 matches the Analytics cohort) ──
interface Tier {
  id: string;
  label: string;
  count: number;
  color: string;
  desc: string;
  delta: string;
  up: boolean; // is the count rising?
}
const TIERS: Tier[] = [
  { id: "critical", label: "Critical", count: 312, color: "var(--c-rose)", desc: "≥0.90 · active decompensation risk", delta: "+11", up: true },
  { id: "high", label: "High", count: 894, color: "var(--c-amber)", desc: "0.75–0.89 · intervene this cycle", delta: "+31", up: true },
  { id: "rising", label: "Rising-risk", count: 3320, color: "var(--c-indigo)", desc: "trajectory crossing upward", delta: "+126", up: true },
  { id: "moderate", label: "Moderate", count: 8140, color: "var(--c-sage)", desc: "0.40–0.59 · monitor", delta: "−54", up: false },
  { id: "low", label: "Low", count: 35544, color: "var(--c-canopy)", desc: "<0.40 · well-managed", delta: "+402", up: true },
];
const TOTAL = TIERS.reduce((s, t) => s + t.count, 0); // 48,210
const HIGH_RISK = TIERS[0].count + TIERS[1].count; // 1,206

// ── Population-level driver decomposition (explainability) ───────────────────
// Share of the high-risk cohort whose elevation is primarily attributable to
// each driver. Sums to 100. Each cites the resource types behind it.
interface Driver {
  label: string;
  pct: number;
  detail: string;
  resources: string;
  tone: "rose" | "amber" | "indigo" | "sage";
}
const DRIVERS: Driver[] = [
  { label: "Uncontrolled diabetes (HbA1c ≥ 9%)", pct: 34, detail: "640 patients with a recent HbA1c above 9.0%", resources: "Observation · Condition", tone: "rose" },
  { label: "High acute utilization (≥2 ED/IP · 90d)", pct: 27, detail: "ED + inpatient encounters above cohort baseline", resources: "Encounter · Claim", tone: "amber" },
  { label: "Medication non-adherence", pct: 18, detail: "Missing refill events vs. expected fill cadence", resources: "MedicationRequest", tone: "indigo" },
  { label: "CHF / CKD comorbidity burden", pct: 13, detail: "Two or more HCC-weighted chronic conditions", resources: "Condition", tone: "sage" },
  { label: "Open care gaps (≥3)", pct: 8, detail: "Overdue screenings compounding clinical risk", resources: "Quality measure", tone: "amber" },
];
const TONE_HEX: Record<Driver["tone"], string> = {
  rose: "var(--c-rose)",
  amber: "var(--c-amber)",
  indigo: "var(--c-indigo)",
  sage: "var(--c-sage)",
};

const RISK_TREND = [1180, 1188, 1184, 1192, 1190, 1198, 1201, 1199, 1204, 1206];

function fmt(n: number) {
  return n.toLocaleString();
}

function TierBar() {
  return (
    <div>
      {/* stacked proportion bar */}
      <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", border: "1px solid var(--line)" }}>
        {TIERS.map((t) => (
          <div key={t.id} title={`${t.label} · ${fmt(t.count)}`} style={{ width: `${(t.count / TOTAL) * 100}%`, background: t.color }} />
        ))}
      </div>
      {/* tier cells */}
      <div className="grid g-5" style={{ marginTop: 14, gap: 12 }}>
        {TIERS.map((t) => (
          <div key={t.id} className="card card-pad" style={{ padding: "13px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: t.color, flex: "none" }} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t.label}</span>
            </div>
            <div className="tnum" style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-.025em", marginTop: 8, lineHeight: 1 }}>{fmt(t.count)}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <span className="tnum" style={{ fontSize: 11.5, fontWeight: 600, color: t.up ? (t.id === "low" ? "var(--canopy)" : "var(--rose)") : "var(--canopy)" }}>
                {t.delta}
              </span>
              <span style={{ fontSize: 10.5, color: "var(--muted)" }}>7d</span>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 7, lineHeight: 1.35, textWrap: "pretty" }}>{t.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
   Population risk map — an interactive k-means clustering of a representative
   158-patient slice of the panel, projected into a 2-D embedding
   (acute-utilization × comorbidity-burden). Everything below is PURE and
   deterministic: a seeded PRNG stands in for Math.random so the cloud is
   identical on the server and the client (SSR-safe, no hydration drift) and
   stable across re-renders. The clustering is a real Lloyd's k-means with
   k-means++ seeding; cluster outlines are smoothed, padded convex hulls.
   ─────────────────────────────────────────────────────────────────────────── */
type Pt = { x: number; y: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Deterministic PRNG (mulberry32) — pure function of its seed, so the same seed
// always yields the same stream. This is what keeps the projection SSR-safe.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box–Muller standard normal from the seeded uniform stream.
function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Latent condition cohorts laid out across the embedding. x ≈ acute utilization
// & cost, y ≈ chronic comorbidity burden; risk grows toward the top-right.
interface MapCohort {
  id: string;
  label: string;
  color: string;
  cx: number;
  cy: number;
  spread: number;
  n: number;
  conds: string[];
  extra: string[];
}
const MAP_COHORTS: MapCohort[] = [
  { id: "well", label: "Well-managed", color: "var(--c-canopy)", cx: 22, cy: 20, spread: 11, n: 34, conds: ["HTN (controlled)"], extra: ["Hyperlipidemia", "Obesity"] },
  { id: "htn", label: "Hypertension", color: "var(--c-sage)", cx: 40, cy: 36, spread: 12, n: 28, conds: ["Hypertension", "Hyperlipidemia"], extra: ["Obesity", "CKD stage 2"] },
  { id: "rising", label: "Rising-risk", color: "var(--c-indigo)", cx: 53, cy: 50, spread: 13, n: 26, conds: ["Prediabetes", "Obesity"], extra: ["Med non-adherence", "Tobacco use", "Depression"] },
  { id: "dm", label: "Diabetes", color: "var(--c-amber)", cx: 60, cy: 60, spread: 12, n: 28, conds: ["Type 2 diabetes", "Neuropathy"], extra: ["Retinopathy", "CKD stage 3", "Hypertension"] },
  { id: "copd", label: "COPD", color: "var(--lime)", cx: 74, cy: 48, spread: 11, n: 20, conds: ["COPD", "Tobacco use"], extra: ["Sleep apnea", "Anxiety"] },
  { id: "chfckd", label: "CHF · CKD", color: "var(--c-rose)", cx: 80, cy: 76, spread: 11, n: 22, conds: ["CHF", "CKD stage 3"], extra: ["Hyperkalemia", "Atrial fibrillation", "Anemia"] },
];

// Plausible-looking initials without the rare/ambiguous letters.
const INIT_LETTERS = "ABCDEFGHJKLMNPRSTVW";

export interface ClusterPatient {
  id: string;
  initials: string;
  x: number; // 0..100 — acute utilization & cost
  y: number; // 0..100 — comorbidity burden
  risk: number; // 0..1 predicted risk score
  age: number;
  cohort: number; // index into MAP_COHORTS
  comorbidities: string[];
}

// Generate the representative slice. Deterministic: one seeded stream feeds the
// whole population in a fixed order, so the cloud never shifts between renders.
export function generateClusterPatients(): ClusterPatient[] {
  const rng = makeRng(0x1eaf9e3d);
  const out: ClusterPatient[] = [];
  let seq = 1;
  MAP_COHORTS.forEach((c, ci) => {
    for (let i = 0; i < c.n; i++) {
      const x = clamp(c.cx + gauss(rng) * c.spread, 3, 97);
      const y = clamp(c.cy + gauss(rng) * c.spread, 3, 97);
      const risk = clamp(0.1 + 0.0042 * x + 0.0042 * y + (rng() - 0.5) * 0.06, 0.05, 0.99);
      const age = Math.round(clamp(44 + gauss(rng) * 12 + (y - 40) * 0.18, 23, 92));
      const conds = [...c.conds];
      const extraCount = risk > 0.8 ? 2 : risk > 0.6 ? 1 : 0;
      for (let e = 0; e < extraCount && c.extra.length > 0; e++) {
        const cond = c.extra[Math.floor(rng() * c.extra.length)];
        if (!conds.includes(cond)) conds.push(cond);
      }
      const initials =
        INIT_LETTERS[Math.floor(rng() * INIT_LETTERS.length)] +
        INIT_LETTERS[Math.floor(rng() * INIT_LETTERS.length)];
      out.push({ id: `MAP-${String(seq++).padStart(3, "0")}`, initials, x, y, risk, age, cohort: ci, comorbidities: conds });
    }
  });
  return out;
}

export interface KMeansResult {
  assignments: number[];
  centroids: Pt[];
}

// Lloyd's k-means with deterministic k-means++ seeding. Operates directly on
// the 2-D embedding coordinates.
export function kMeans(points: Pt[], k: number, seed = 0x5eed): KMeansResult {
  const n = points.length;
  if (n === 0 || k <= 0) return { assignments: [], centroids: [] };
  const kk = Math.min(k, n);
  const rng = makeRng((seed + kk * 0x9e3779b1) >>> 0);
  const d2 = (a: Pt, b: Pt) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };
  // k-means++ seeding
  const centroids: Pt[] = [{ ...points[Math.floor(rng() * n)] }];
  while (centroids.length < kk) {
    const dists = points.map((p) => Math.min(...centroids.map((c) => d2(p, c))));
    const sum = dists.reduce((acc, v) => acc + v, 0) || 1;
    let r = rng() * sum;
    let idx = 0;
    for (; idx < n; idx++) {
      r -= dists[idx];
      if (r <= 0) break;
    }
    centroids.push({ ...points[Math.min(idx, n - 1)] });
  }
  const assignments = new Array<number>(n).fill(0);
  for (let iter = 0; iter < 24; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const dd = d2(points[i], centroids[c]);
        if (dd < bestD) {
          bestD = dd;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        moved = true;
      }
    }
    const sx = new Array<number>(centroids.length).fill(0);
    const sy = new Array<number>(centroids.length).fill(0);
    const cnt = new Array<number>(centroids.length).fill(0);
    for (let i = 0; i < n; i++) {
      const a = assignments[i];
      sx[a] += points[i].x;
      sy[a] += points[i].y;
      cnt[a]++;
    }
    for (let c = 0; c < centroids.length; c++) {
      if (cnt[c] > 0) centroids[c] = { x: sx[c] / cnt[c], y: sy[c] / cnt[c] };
    }
    if (!moved && iter > 0) break;
  }
  return { assignments, centroids };
}

// Andrew's monotone-chain convex hull (counter-clockwise, no repeated endpoint).
export function convexHull(input: Pt[]): Pt[] {
  const p = input.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const n = p.length;
  if (n < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: Pt[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// Catmull-Rom → cubic Bézier closed spline through the given vertices.
function smoothClosedPath(pts: Pt[]): string {
  const n = pts.length;
  if (n < 3) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return `${d} Z`;
}

// Build a soft enclosing blob for a set of points: convex hull, pushed outward
// from its centroid, then smoothed. Small groups fall back to a padded circle.
function groupBlobPath(svgPts: Pt[], pad: number): string {
  if (svgPts.length === 0) return "";
  const cx = svgPts.reduce((s, p) => s + p.x, 0) / svgPts.length;
  const cy = svgPts.reduce((s, p) => s + p.y, 0) / svgPts.length;
  if (svgPts.length < 3) {
    const r = Math.max(18, ...svgPts.map((p) => Math.hypot(p.x - cx, p.y - cy))) + pad;
    const poly = Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });
    return smoothClosedPath(poly);
  }
  const hull = convexHull(svgPts).map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * pad, y: p.y + (dy / len) * pad };
  });
  return smoothClosedPath(hull);
}

const CLUSTER_PALETTE = ["var(--c-indigo)", "var(--c-amber)", "var(--c-rose)", "var(--c-canopy)", "var(--lime)", "var(--c-sage)"];

interface MapTier {
  label: string;
  color: string;
  lo: number;
}
const MAP_TIERS: MapTier[] = [
  { label: "Critical", color: "var(--c-rose)", lo: 0.85 },
  { label: "High", color: "var(--c-amber)", lo: 0.7 },
  { label: "Moderate", color: "var(--c-sage)", lo: 0.45 },
  { label: "Low", color: "var(--c-canopy)", lo: 0 },
];
const tierOf = (risk: number) => MAP_TIERS.find((t) => risk >= t.lo) ?? MAP_TIERS[MAP_TIERS.length - 1];

interface MapGroup {
  key: string;
  label: string;
  sub?: string;
  color: string;
  members: number[];
  centroid?: Pt; // data-space centroid, for k-means markers
}

type GroupMode = "kmeans" | "cohort" | "risk";

function RiskClusterMap({ toast }: { toast?: (m: string) => void }) {
  const [mode, setMode] = React.useState<GroupMode>("kmeans");
  const [k, setK] = React.useState(4);
  const [hover, setHover] = React.useState<number | null>(null);
  const [active, setActive] = React.useState<number | null>(null);

  const patients = React.useMemo(() => generateClusterPatients(), []);
  const km = React.useMemo(() => kMeans(patients.map((p) => ({ x: p.x, y: p.y })), k), [patients, k]);

  const rawId = React.useId();
  const uid = rawId.replace(/:/g, "");

  // Canvas geometry — viewBox space. The <svg> renders at width:100% / height:auto
  // so the rendered box matches this aspect ratio exactly, which lets the HTML
  // tooltip be placed by simple percentage of the same coordinate system.
  const W = 820;
  const H = 480;
  const padL = 46;
  const padR = 24;
  const padT = 26;
  const padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const SX = (x: number) => padL + (x / 100) * plotW;
  const SY = (y: number) => padT + (1 - y / 100) * plotH;

  // Build the active grouping (defines hulls, dot colors and the legend).
  const groups: MapGroup[] = React.useMemo(() => {
    if (mode === "cohort") {
      return MAP_COHORTS.map((c, ci) => ({
        key: c.id,
        label: c.label,
        color: c.color,
        members: patients.map((p, i) => (p.cohort === ci ? i : -1)).filter((i) => i >= 0),
      }));
    }
    if (mode === "risk") {
      return MAP_TIERS.map((t, ti) => ({
        key: t.label,
        label: t.label,
        sub: ti === 0 ? "≥ 0.85" : `${t.lo.toFixed(2)}–${(MAP_TIERS[ti - 1].lo - 0.01).toFixed(2)}`,
        color: t.color,
        members: patients.map((p, i) => (tierOf(p.risk).label === t.label ? i : -1)).filter((i) => i >= 0),
      }));
    }
    // k-means
    return km.centroids.map((centroid, c) => {
      const members = km.assignments.map((a, i) => (a === c ? i : -1)).filter((i) => i >= 0);
      const tally = new Array<number>(MAP_COHORTS.length).fill(0);
      members.forEach((i) => {
        tally[patients[i].cohort]++;
      });
      let dom = 0;
      tally.forEach((v, ci) => {
        if (v > tally[dom]) dom = ci;
      });
      return {
        key: `c${c}`,
        label: `Cluster ${String.fromCharCode(65 + c)}`,
        sub: members.length ? `mostly ${MAP_COHORTS[dom].label}` : "empty",
        color: CLUSTER_PALETTE[c % CLUSTER_PALETTE.length],
        members,
        centroid,
      };
    });
  }, [mode, patients, km]);

  // Per-patient → group index, plus convenience colour lookup.
  const groupOf = React.useMemo(() => {
    const arr = new Array<number>(patients.length).fill(0);
    groups.forEach((g, gi) => g.members.forEach((i) => (arr[i] = gi)));
    return arr;
  }, [groups, patients.length]);

  // Draw the biggest blobs first so smaller clusters sit legibly on top.
  const blobOrder = React.useMemo(
    () => groups.map((_, i) => i).sort((a, b) => groups[b].members.length - groups[a].members.length),
    [groups],
  );

  const dimmed = (gi: number) => active != null && active !== gi;

  const hp = hover != null ? patients[hover] : null;
  const hgColor = hp ? groups[groupOf[hover as number]].color : "var(--ink)";
  const ttLeft = hp ? (SX(hp.x) / W) * 100 : 0;
  const ttTop = hp ? (SY(hp.y) / H) * 100 : 0;
  const below = ttTop < 24;
  const tx = ttLeft < 17 ? "-10px" : ttLeft > 83 ? "calc(-100% + 10px)" : "-50%";
  const ty = below ? "16px" : "calc(-100% - 14px)";

  return (
    <div className="card card-pad">
      <div className="between" style={{ gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-.01em" }}>Population risk map</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            k-means clustering · acute-utilization × comorbidity-burden embedding
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Group by</span>
          <div className="density-toggle">
            <button className={mode === "kmeans" ? "on" : ""} onClick={() => setMode("kmeans")}>k-means</button>
            <button className={mode === "cohort" ? "on" : ""} onClick={() => setMode("cohort")}>Cohort</button>
            <button className={mode === "risk" ? "on" : ""} onClick={() => setMode("risk")}>Risk tier</button>
          </div>
          {mode === "kmeans" && (
            <>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>k</span>
              <div className="density-toggle">
                {[3, 4, 5, 6].map((n) => (
                  <button key={n} className={k === n ? "on" : ""} onClick={() => setK(n)}>{n}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* canvas + floating tooltip overlay */}
      <div style={{ position: "relative", marginTop: 12, overflow: "visible" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: "block", width: "100%", height: "auto", touchAction: "none" }}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`${uid}-field`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="var(--canopy)" stopOpacity="0.06" />
              <stop offset="0.55" stopColor="var(--paper)" stopOpacity="0" />
              <stop offset="1" stopColor="var(--rose)" stopOpacity="0.07" />
            </linearGradient>
            <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>

          {/* recessed plot well + risk field */}
          <rect x={padL} y={padT} width={plotW} height={plotH} rx="14" fill="var(--cream)" />
          <rect x={padL} y={padT} width={plotW} height={plotH} rx="14" fill={`url(#${uid}-field)`} />

          {/* grid */}
          {[0.25, 0.5, 0.75].map((g) => (
            <g key={g}>
              <line x1={padL + plotW * g} y1={padT} x2={padL + plotW * g} y2={padT + plotH} stroke="var(--c-grid)" strokeWidth="1" strokeDasharray="2 5" />
              <line x1={padL} y1={padT + plotH * g} x2={padL + plotW} y2={padT + plotH * g} stroke="var(--c-grid)" strokeWidth="1" strokeDasharray="2 5" />
            </g>
          ))}
          <rect x={padL} y={padT} width={plotW} height={plotH} rx="14" fill="none" stroke="var(--line)" strokeWidth="1" />

          {/* axes */}
          <text x={padL + plotW / 2} y={H - 12} fontSize="11" fill="var(--muted)" textAnchor="middle" fontFamily="var(--mono)">
            acute utilization &amp; cost →
          </text>
          <text x={16} y={padT + plotH / 2} fontSize="11" fill="var(--muted)" textAnchor="middle" fontFamily="var(--mono)" transform={`rotate(-90 16 ${padT + plotH / 2})`}>
            comorbidity burden →
          </text>
          <text x={padL + 8} y={padT + plotH - 8} fontSize="10" fill="var(--faint)" fontFamily="var(--mono)">lower risk</text>
          <text x={padL + plotW - 8} y={padT + 16} fontSize="10" fill="var(--faint)" fontFamily="var(--mono)" textAnchor="end">higher risk</text>

          {/* cluster blobs (soft fill + crisp outline) */}
          {blobOrder.map((gi) => {
            const g = groups[gi];
            if (g.members.length === 0) return null;
            const svgPts = g.members.map((i) => ({ x: SX(patients[i].x), y: SY(patients[i].y) }));
            const path = groupBlobPath(svgPts, 17);
            const op = dimmed(gi) ? 0.18 : 1;
            return (
              <g key={g.key} style={{ transition: "opacity .2s ease" }} opacity={op}>
                <path d={path} fill={g.color} fillOpacity={0.1} filter={`url(#${uid}-soft)`} />
                <path d={path} fill={g.color} fillOpacity={0.05} stroke={g.color} strokeOpacity={0.5} strokeWidth="1.4" strokeDasharray="1 5" strokeLinecap="round" />
              </g>
            );
          })}

          {/* patient dots */}
          {patients.map((p, i) => {
            const g = groups[groupOf[i]];
            const r = 3.3 + p.risk * 2.7;
            const isHover = hover === i;
            const op = dimmed(groupOf[i]) ? 0.12 : isHover ? 1 : 0.9;
            return (
              <circle
                key={p.id}
                cx={SX(p.x)}
                cy={SY(p.y)}
                r={isHover ? r + 2 : r}
                fill={g.color}
                fillOpacity={op}
                stroke="var(--paper)"
                strokeWidth={isHover ? 1.6 : 0.9}
                style={{ cursor: "pointer", transition: "r .12s ease" }}
                onMouseEnter={() => setHover(i)}
              />
            );
          })}

          {/* k-means centroid markers */}
          {mode === "kmeans" &&
            groups.map((g, gi) =>
              g.members.length === 0 || !g.centroid ? null : (
                <g key={`ctr-${g.key}`} opacity={dimmed(gi) ? 0.18 : 1} style={{ pointerEvents: "none" }}>
                  <circle cx={SX(g.centroid.x)} cy={SY(g.centroid.y)} r="9" fill="var(--paper)" fillOpacity={0.85} stroke={g.color} strokeWidth="1.8" />
                  <line x1={SX(g.centroid.x) - 4} y1={SY(g.centroid.y)} x2={SX(g.centroid.x) + 4} y2={SY(g.centroid.y)} stroke={g.color} strokeWidth="1.6" strokeLinecap="round" />
                  <line x1={SX(g.centroid.x)} y1={SY(g.centroid.y) - 4} x2={SX(g.centroid.x)} y2={SY(g.centroid.y) + 4} stroke={g.color} strokeWidth="1.6" strokeLinecap="round" />
                </g>
              ),
            )}

          {/* re-draw the hovered dot on top so its halo is never occluded */}
          {hp && (
            <g style={{ pointerEvents: "none" }}>
              <circle cx={SX(hp.x)} cy={SY(hp.y)} r={3.3 + hp.risk * 2.7 + 7} fill="none" stroke={hgColor} strokeOpacity={0.35} strokeWidth="1.4" />
              <circle cx={SX(hp.x)} cy={SY(hp.y)} r={3.3 + hp.risk * 2.7 + 2} fill={hgColor} stroke="var(--paper)" strokeWidth="1.6" />
            </g>
          )}
        </svg>

        {hp && (
          <div
            style={{
              position: "absolute",
              left: `${ttLeft}%`,
              top: `${ttTop}%`,
              transform: `translate(${tx}, ${ty})`,
              pointerEvents: "none",
              background: "var(--paper)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-md)",
              boxShadow: "var(--sh-pop)",
              padding: "10px 12px",
              minWidth: 176,
              maxWidth: 230,
              zIndex: 5,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: hgColor, color: "#fff", display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 700, flex: "none", letterSpacing: ".02em" }}>
                {hp.initials}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="tnum" style={{ fontSize: 12.5, fontWeight: 600 }}>{hp.id}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{hp.age}y · {MAP_COHORTS[hp.cohort].label}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 9 }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>Risk score</span>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: tierOf(hp.risk).color }}>{hp.risk.toFixed(2)}</span>
            </div>
            <div style={{ height: 5, background: "var(--cream-deep)", borderRadius: 3, overflow: "hidden", marginTop: 5 }}>
              <div style={{ width: `${Math.round(hp.risk * 100)}%`, height: "100%", background: tierOf(hp.risk).color, borderRadius: 3 }} />
            </div>
            <div style={{ marginTop: 9 }}>
              <div style={{ fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 5 }}>Comorbidities</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {hp.comorbidities.slice(0, 4).map((c) => (
                  <span key={c} style={{ fontSize: 10.5, color: "var(--ink-2)", background: "var(--cream-deep)", padding: "1px 6px", borderRadius: 5, fontFamily: "var(--mono)" }}>{c}</span>
                ))}
                {hp.comorbidities.length > 4 && (
                  <span style={{ fontSize: 10.5, color: "var(--muted)", padding: "1px 4px" }}>+{hp.comorbidities.length - 4}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* interactive legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        {groups.map((g, gi) => {
          if (g.members.length === 0) return null;
          const avg = g.members.reduce((s, i) => s + patients[i].risk, 0) / g.members.length;
          return (
            <button
              key={g.key}
              onMouseEnter={() => setActive(gi)}
              onMouseLeave={() => setActive(null)}
              onClick={() => toast?.(`Focused ${g.members.length} patients · ${g.label} (avg risk ${avg.toFixed(2)})`)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: "1px solid var(--line)",
                background: active === gi ? "var(--canopy-faint)" : "var(--paper)",
                borderColor: active === gi ? "var(--line-sage)" : "var(--line)",
                borderRadius: "var(--r-sm)",
                padding: "6px 10px",
                cursor: "pointer",
                transition: "background .15s ease, border-color .15s ease",
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 3, background: g.color, flex: "none" }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{g.label}</span>
              {g.sub && <span style={{ fontSize: 11, color: "var(--muted)" }}>· {g.sub}</span>}
              <span className="tnum" style={{ fontSize: 11.5, color: "var(--muted)", fontFamily: "var(--mono)" }}>{g.members.length}</span>
              <span className="tnum" style={{ fontSize: 11, color: tierOf(avg).color, fontWeight: 600 }}>{avg.toFixed(2)}</span>
            </button>
          );
        })}
      </div>

      <div className="m-prov" style={{ marginTop: 12, fontSize: 10.5, color: "var(--faint)", fontFamily: "var(--mono)", display: "flex", alignItems: "center", gap: 5 }}>
        <Icon name="layers" size={11} /> Representative {patients.length}-patient 2-D embedding of the {fmt(TOTAL)}-member panel · k-means (Lloyd's · k-means++ init) · hover a dot for the patient detail
      </div>
    </div>
  );
}

export function RiskSurface({
  patients,
  openDrawer,
  toast,
}: {
  patients?: PatientRow[];
  openDrawer: { patient: (p: PatientRow) => void };
  toast?: (m: string) => void;
}) {
  const rows = patients && patients.length ? patients : DEMO_DATA.patients;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Intelligence</div>
          <h1 className="page-title">Risk stratification</h1>
          <p className="page-lede">
            The full panel sorted by predicted risk, with the drivers behind every tier made
            explicit. {fmt(HIGH_RISK)} patients sit in the high-risk cohort; {TIERS[2].count.toLocaleString()} more
            are rising toward it.
          </p>
        </div>
        <div className="page-head-actions">
          <button className="cmd-ctrl" onClick={() => toast?.("Queued outreach for 42 newly rising-risk patients…")}>
            <Icon name="users" size={15} />Outreach rising-risk
          </button>
          <button className="cmd-ctrl" onClick={() => toast?.("Exporting risk stratification (de-identified)…")}>
            <Icon name="download" size={15} />Export
          </button>
        </div>
      </div>

      {/* model card */}
      <div className="headline" style={{ margin: "16px 0 20px" }}>
        <span className="hl-ic"><Icon name="pulse" size={19} /></span>
        <div>
          <div className="hl-txt">
            <b>42 patients newly crossed the high-risk threshold this week</b> — concentrated in the rising-risk
            diabetes sub-cohort. Acting now is projected to avert <b>~$310K</b> in avoidable ED and inpatient utilization.
          </div>
          <div className="hl-meta">HCC v28 + 90-day utilization model · AUC 0.84 · calibrated · refreshed 2h ago</div>
        </div>
      </div>

      {/* tier distribution */}
      <div className="sec-title">
        <h2>Risk distribution</h2>
        <span className="count">{fmt(TOTAL)} patients</span>
        <span className="link" onClick={() => toast?.("Opening cohort in Analytics Workbench…")}>Open in Analytics<Icon name="arrowR" size={14} /></span>
      </div>
      <TierBar />

      {/* driver decomposition + trend */}
      <div className="grid g-3" style={{ marginTop: 24 }}>
        <div className="card span-2 card-pad">
          <div className="between" style={{ marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-.01em" }}>What's driving high risk</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Primary attributable driver across the {fmt(HIGH_RISK)} high-risk patients</div>
            </div>
            <Badge tone="indigo" dot={false}>Explainable</Badge>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 14 }}>
            {DRIVERS.map((d) => (
              <div key={d.label}>
                <div className="between" style={{ marginBottom: 5, gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 540, minWidth: 0 }}>{d.label}</span>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: TONE_HEX[d.tone], flex: "none" }}>{d.pct}%</span>
                </div>
                <div style={{ height: 8, background: "var(--cream-deep)", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ width: `${d.pct}%`, height: "100%", background: TONE_HEX[d.tone], borderRadius: 5, transition: "width .7s ease" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                  <span style={{ fontSize: 11.5, color: "var(--ink-2)" }}>{d.detail}</span>
                  <span className="dotsep">·</span>
                  <Badge tone="gray" mono dot={false}>{d.resources}</Badge>
                </div>
              </div>
            ))}
          </div>
          <div className="m-prov" style={{ marginTop: 14 }}>
            <Icon name="layers" size={11} /> Attribution from the HCC v28 + utilization model · drivers are non-overlapping primary causes · refreshed 2h ago
          </div>
        </div>

        <div className="card card-pad">
          <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-.01em" }}>High-risk cohort · 30d</div>
          <div className="tnum" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.03em", marginTop: 10, lineHeight: 1 }}>{fmt(HIGH_RISK)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
            <span style={{ color: "var(--rose)" }}><Icon name="arrowUp" size={13} /></span>
            <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--rose)" }}>+42</span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>new this week</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <Sparkline data={RISK_TREND} color="var(--c-rose)" w={232} h={56} />
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line-soft)" }}>
            <div className="between" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Reachable for outreach</span>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "var(--canopy)" }}>1,041</span>
            </div>
            <div className="between">
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Avoidable cost at stake</span>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 600 }}>$310K</span>
            </div>
            <button className="insight-action" style={{ width: "100%", justifyContent: "center", marginTop: 14 }} onClick={() => toast?.("Queued outreach for 42 newly rising-risk patients…")}>
              <Icon name="bolt" size={14} />Review 42 rising-risk
            </button>
          </div>
        </div>
      </div>

      {/* population risk map (k-means clustering) */}
      <div className="sec-title">
        <h2>Population risk map</h2>
        <span className="count">158-patient projection</span>
        <span className="link" onClick={() => toast?.("Opening the 2-D risk embedding in Analytics Workbench…")}>Open embedding<Icon name="arrowR" size={14} /></span>
      </div>
      <RiskClusterMap toast={toast} />

      {/* stratified cohort */}
      <div className="sec-title">
        <h2>Highest-risk patients</h2>
        <span className="count">sorted by risk score</span>
        <span className="link" onClick={() => toast?.("Exporting cohort (de-identified)…")}>Export cohort<Icon name="arrowR" size={14} /></span>
      </div>
      <PatientTable patients={rows} onOpen={openDrawer.patient} toast={toast} />
    </div>
  );
}

export default RiskSurface;
