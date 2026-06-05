"use client";
/* LEAFNERD — Intelligence · Quality measures (HEDIS / CMS gap closure) */
import React from "react";
import { Icon, Badge, Sparkline } from "./primitives";
import type { QualityMeasureRow } from "@/lib/leafnerd/types";

/**
 * QualitySurface — HEDIS/CMS-style quality-measure gap closure.
 *
 * Per the cardinal resilience rule, this renders fully with zero props: when
 * `rows` is absent or empty we fall back to a curated set of ~6 believable
 * measures. Every number carries provenance (steward + numerator/denominator).
 *
 * Three surfaces sit on top of the measure list:
 *   1. A purpose-built radial SVG gauge per measure — the compliance rate as an
 *      arc, with the benchmark rendered as a tick on the dial and a delta-to-
 *      target readout in the hub.
 *   2. A care-gap roster drawer, opened from any card, listing the patients
 *      missing that screening (deterministically synthesized from the measure
 *      so the same card always yields the same roster).
 *   3. Mock outreach triggers — per-patient, per-roster, and per-card — that
 *      show a loading spinner before resolving to a "queued" confirmation.
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

/* ------------------------------------------------------------------ *
 * Scoped styles — spinner keyframe + roster rows. Injected once with
 * the surface so everything stays in this file; selectors live under
 * `.ln-root` to match the rest of the design system.
 * ------------------------------------------------------------------ */
const QM_CSS = `
@keyframes qm-spin { to { transform: rotate(360deg); } }
.ln-root .qm-spin { display:inline-block; box-sizing:border-box; border-radius:50%;
  border:2px solid color-mix(in srgb, currentColor 22%, transparent); border-top-color: currentColor;
  animation: qm-spin .7s linear infinite; vertical-align:-2px; }
.ln-root .qm-gaplink { display:inline-flex; align-items:center; gap:6px; background:none; border:none;
  padding:0; margin:0; cursor:pointer; color:inherit; font:inherit; text-align:left; }
.ln-root .qm-gapnum { transition: color .15s ease; }
.ln-root .qm-gaplink:hover .qm-gapnum { color:var(--canopy-deep); }
.ln-root .qm-roster-row { display:flex; align-items:center; gap:12px; padding:11px 13px; border:1px solid var(--line);
  border-radius:var(--r-md); background:var(--paper); box-shadow:var(--sh-1); }
.ln-root .qm-roster-row + .qm-roster-row { margin-top:8px; }
.ln-root .qm-roster-row.muted { opacity:.62; }
.ln-root .qm-meta { display:flex; align-items:center; gap:7px; flex-wrap:wrap; margin-top:4px;
  font-size:11px; color:var(--muted); }
.ln-root .qm-mini-btn { display:inline-flex; align-items:center; gap:6px; flex:none; font-size:12px; font-weight:550;
  border-radius:var(--r-sm); padding:6px 11px; cursor:pointer; border:1px solid var(--line);
  background:var(--paper); color:var(--ink-2); transition: background .15s ease, border-color .15s ease, color .15s ease; }
.ln-root .qm-mini-btn:hover:not(:disabled) { border-color:#d3cdbd; background:var(--paper-2); }
.ln-root .qm-mini-btn:disabled { cursor:default; }
.ln-root .qm-mini-btn.sent { background:var(--canopy-faint); border-color:var(--line-sage); color:var(--canopy-deep); }
.ln-root .qm-mini-btn.off { color:var(--faint); }
.ln-root .qm-filter { display:inline-flex; align-items:center; gap:7px; font-size:12px; color:var(--ink-2);
  cursor:pointer; user-select:none; }
.ln-root .qm-toggle { width:34px; height:19px; border-radius:11px; background:var(--cream-deep); position:relative;
  transition: background .18s ease; flex:none; }
.ln-root .qm-toggle.on { background:var(--canopy); }
.ln-root .qm-toggle::after { content:""; position:absolute; top:2px; left:2px; width:15px; height:15px; border-radius:50%;
  background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.2); transition: transform .18s ease; }
.ln-root .qm-toggle.on::after { transform: translateX(15px); }
`;

/* ----------------------- radial SVG gauge ----------------------- */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180; // 0° = 12 o'clock, clockwise positive
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [x1, y1] = polar(cx, cy, r, startDeg);
  const [x2, y2] = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * RadialGauge — a 270° open-bottom dial. The track is the full sweep; the value
 * arc is the compliance rate; a tick on the ring marks the benchmark; the hub
 * shows the rate and its signed distance to target.
 */
function RadialGauge({
  rate,
  target,
  color,
  size = 120,
  label = "compliance",
}: {
  rate: number; // 0..100
  target: number; // 0..100
  color: string;
  size?: number;
  label?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 11;
  const START = 225;
  const SWEEP = 270;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const valueEnd = START + SWEEP * (clamp(rate) / 100);
  const targetDeg = START + SWEEP * (clamp(target) / 100);
  const [tx1, ty1] = polar(cx, cy, r - 7, targetDeg);
  const [tx2, ty2] = polar(cx, cy, r + 7, targetDeg);
  const delta = Math.round(rate - target);
  const ahead = delta >= 0;

  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={`Compliance ${Math.round(rate)}% against target ${Math.round(target)}%`}
      >
        <path d={arcPath(cx, cy, r, START, START + SWEEP)} fill="none" stroke="var(--cream-deep)" strokeWidth="8" strokeLinecap="round" />
        {rate > 0 && (
          <path
            d={arcPath(cx, cy, r, START, valueEnd)}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            style={{ transition: "all .8s cubic-bezier(.22,.61,.36,1)" }}
          />
        )}
        {/* benchmark tick */}
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div style={{ transform: "translateY(-3px)" }}>
          <div className="tnum" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.03em", lineHeight: 1 }}>
            {Math.round(rate)}
            <span style={{ fontSize: 15, color: "var(--muted)" }}>%</span>
          </div>
          <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 3, letterSpacing: ".02em", textTransform: "uppercase" }}>{label}</div>
          <div className="tnum" style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: ahead ? "var(--canopy)" : "var(--rose)" }}>
            {ahead ? "+" : "−"}{Math.abs(delta)} pts
          </div>
        </div>
      </div>
    </div>
  );
}

function Spinner({ size = 13 }: { size?: number }) {
  return <span className="qm-spin" style={{ width: size, height: size }} aria-hidden />;
}

/* ----------------------- care-gap roster ----------------------- */
type Channel = "Phone" | "Portal" | "Email" | "Mail-only";

interface GapPatient {
  id: string;
  name: string;
  age: number;
  sex: "M" | "F";
  never: boolean;
  overdueDays: number;
  channel: Channel;
  reachable: boolean;
  risk: "High" | "Moderate" | "Low";
}

// Outreach state per patient, lifted to the surface so it survives drawer reopen.
type OutreachStatus = "sending" | "sent";

const FIRST = [
  "Amara", "Liam", "Sofia", "Noah", "Mia", "Ethan", "Priya", "Marcus", "Elena", "Diego",
  "Hana", "Owen", "Aisha", "Caleb", "Yuki", "Rosa", "Devon", "Leila", "Tomas", "Nadia",
  "Quinn", "Ravi", "Grace", "Mateo",
];
const LAST = [
  "Okafor", "Bennett", "Reyes", "Calder", "Nguyen", "Sato", "Delgado", "Friedman", "Park", "Abara",
  "Costa", "Mwangi", "Holt", "Vance", "Iqbal", "Romano", "Boateng", "Sandberg", "Cho", "Flores",
  "Ortega", "Singh", "Webb", "Lozano",
];

const CHANNEL_TONE: Record<Channel, string> = {
  Phone: "indigo", Portal: "green", Email: "indigo", "Mail-only": "gray",
};
const RISK_TONE: Record<GapPatient["risk"], string> = {
  High: "rose", Moderate: "amber", Low: "gray",
};

// FNV-1a string hash → 32-bit unsigned, seeds the deterministic generator.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 PRNG — deterministic so a measure always yields the same roster.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function agoLabel(days: number): string {
  if (days >= 365) {
    const y = days / 365;
    return `${y < 2 ? y.toFixed(1) : Math.round(y)} yr ago`;
  }
  return `${Math.max(1, Math.round(days / 30))} mo ago`;
}

const ROSTER_LIMIT = 14;

/** Synthesize a believable, stable roster for a measure's open care gaps. */
function buildRoster(m: QualityMeasureRow): GapPatient[] {
  const n = Math.min(ROSTER_LIMIT, m.gaps);
  const reachFrac = m.gaps > 0 ? m.reachable / m.gaps : 0;
  const rand = mulberry32(hashStr(m.id));
  const abbr = m.abbrev.replace(/[^A-Z0-9]/gi, "").slice(0, 3).toUpperCase();
  const rows: GapPatient[] = [];
  for (let i = 0; i < n; i++) {
    const first = FIRST[Math.floor(rand() * FIRST.length)];
    const last = LAST[Math.floor(rand() * LAST.length)];
    const sex: "M" | "F" = rand() > 0.5 ? "F" : "M";
    const age = 34 + Math.floor(rand() * 50);
    const never = rand() < 0.16;
    const overdueDays = never ? 0 : 90 + Math.floor(rand() * 620);
    const reachable = rand() < reachFrac;
    const channel: Channel = reachable
      ? (["Phone", "Portal", "Email"] as Channel[])[Math.floor(rand() * 3)]
      : "Mail-only";
    const rr = rand();
    const risk: GapPatient["risk"] = rr < 0.22 ? "High" : rr < 0.6 ? "Moderate" : "Low";
    const mrn = `${abbr}-${1000 + Math.floor(rand() * 8999)}`;
    rows.push({ id: `${m.id}:${i}:${mrn}`, name: `${first} ${last}`, age, sex, never, overdueDays, reachable, channel, risk });
  }
  // Worklist order: highest risk first, then most overdue (never-screened on top).
  const riskRank = { High: 0, Moderate: 1, Low: 2 } as const;
  rows.sort((a, b) =>
    riskRank[a.risk] - riskRank[b.risk] ||
    (b.never ? 1 : 0) - (a.never ? 1 : 0) ||
    b.overdueDays - a.overdueDays,
  );
  return rows;
}

function mrnOf(id: string): string {
  const parts = id.split(":");
  return parts[parts.length - 1] || id;
}

function RosterRow({
  p,
  abbrev,
  status,
  onRemind,
}: {
  p: GapPatient;
  abbrev: string;
  status: OutreachStatus | undefined;
  onRemind: () => void;
}) {
  let btn: React.ReactNode;
  if (!p.reachable) {
    btn = (
      <button className="qm-mini-btn off" disabled title="No digital channel on file — mail only">
        <Icon name="x" size={13} />No channel
      </button>
    );
  } else if (status === "sent") {
    btn = (
      <button className="qm-mini-btn sent" disabled>
        <Icon name="check" size={13} />Queued
      </button>
    );
  } else if (status === "sending") {
    btn = (
      <button className="qm-mini-btn" disabled style={{ color: "var(--muted)" }}>
        <Spinner />Sending…
      </button>
    );
  } else {
    btn = (
      <button className="qm-mini-btn" onClick={onRemind}>
        <Icon name="bolt" size={13} />Remind
      </button>
    );
  }

  return (
    <div className={`qm-roster-row ${p.reachable ? "" : "muted"}`}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-.01em" }}>{p.name}</span>
          <Badge tone={RISK_TONE[p.risk]} dot={false}>{p.risk} risk</Badge>
        </div>
        <div className="qm-meta">
          <span className="mono">{mrnOf(p.id)}</span>
          <span className="dotsep">·</span>
          <span>{p.age}{p.sex}</span>
          <span className="dotsep">·</span>
          {p.never
            ? <span style={{ color: "var(--rose)", fontWeight: 550 }}>Never screened</span>
            : <span>last {abbrev} {agoLabel(p.overdueDays)}</span>}
          <span className="dotsep">·</span>
          <Badge tone={CHANNEL_TONE[p.channel]} dot={false}>{p.channel}</Badge>
        </div>
      </div>
      {btn}
    </div>
  );
}

function CareGapDrawer({
  m,
  outreach,
  onRemind,
  onRemindAll,
  bulkSending,
  onClose,
}: {
  m: QualityMeasureRow;
  outreach: Record<string, OutreachStatus>;
  onRemind: (p: GapPatient) => void;
  onRemindAll: (roster: GapPatient[]) => void;
  bulkSending: boolean;
  onClose: () => void;
}) {
  const [reachableOnly, setReachableOnly] = React.useState(false);
  const roster = React.useMemo(() => buildRoster(m), [m]);
  const s = STATUS[m.status];

  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const shown = reachableOnly ? roster.filter((p) => p.reachable) : roster;
  const reachableRows = roster.filter((p) => p.reachable);
  const allReachableQueued = reachableRows.length > 0 && reachableRows.every((p) => outreach[p.id] === "sent");

  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose}></div>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`Care gaps · ${m.measure}`}>
        <div className="drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="dh-tag">Care-gap roster</div>
            <h3 style={{ textWrap: "pretty" }}>{m.measure}</h3>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Badge tone="gray" mono dot={false}>{m.abbrev}</Badge>
              <Badge tone={STEWARD_TONE[m.steward] ?? "indigo"} dot={false}>{m.steward}</Badge>
              <span className="dotsep">·</span>
              <span><b style={{ color: "var(--rose)" }}>{m.gaps.toLocaleString()}</b> open gaps</span>
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}><Icon name="x" size={17} /></button>
        </div>

        <div className="drawer-body">
          {/* mini stat strip */}
          <div className="norm-section">
            <div className="norm-card" style={{ display: "flex", gap: 22, alignItems: "center" }}>
              <div>
                <div className="tnum" style={{ fontSize: 19, fontWeight: 600, color: "var(--rose)", lineHeight: 1 }}>{m.gaps.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>open gaps</div>
              </div>
              <div>
                <div className="tnum" style={{ fontSize: 19, fontWeight: 600, color: "var(--canopy)", lineHeight: 1 }}>{m.reachable.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>reachable</div>
              </div>
              <div>
                <div className="tnum" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1 }}>{pct(m.rate)}%</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>current rate</div>
              </div>
            </div>
          </div>

          <div className="norm-section">
            <div className="between" style={{ marginBottom: 9, alignItems: "center" }}>
              <div className="nh" style={{ margin: 0 }}>Patients missing this screening</div>
              <label className="qm-filter" onClick={() => setReachableOnly((v) => !v)}>
                <span className={`qm-toggle ${reachableOnly ? "on" : ""}`}></span>
                Reachable only
              </label>
            </div>

            {shown.map((p) => (
              <RosterRow
                key={p.id}
                p={p}
                abbrev={m.abbrev}
                status={outreach[p.id]}
                onRemind={() => onRemind(p)}
              />
            ))}

            <div className="m-prov" style={{ marginTop: 12 }}>
              <Icon name="layers" size={11} /> Showing {shown.length} of {m.gaps.toLocaleString()} — prioritized by risk &amp; overdue interval · synthesized from gap list
            </div>
          </div>

          <button
            className="insight-action"
            style={{ width: "100%", justifyContent: "center", opacity: allReachableQueued ? 0.75 : 1 }}
            disabled={bulkSending || allReachableQueued}
            onClick={() => onRemindAll(roster)}
          >
            {bulkSending ? <Spinner /> : allReachableQueued ? <Icon name="check" size={15} /> : <Icon name="users" size={15} />}
            {bulkSending
              ? "Queuing outreach…"
              : allReachableQueued
                ? "All reachable patients queued"
                : `Queue outreach · ${m.reachable.toLocaleString()} reachable`}
          </button>
        </div>
      </aside>
    </React.Fragment>
  );
}

/* ----------------------- measure card ----------------------- */
function MeasureCard({
  m,
  onViewGaps,
  onGenerate,
}: {
  m: QualityMeasureRow;
  onViewGaps: (m: QualityMeasureRow) => void;
  onGenerate: (m: QualityMeasureRow) => void;
}) {
  const s = STATUS[m.status];
  const ratePct = pct(m.rate);
  const [gen, setGen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const fire = () => {
    if (gen) return;
    setGen(true);
    timer.current = setTimeout(() => {
      setGen(false);
      onGenerate(m);
    }, 1000);
  };

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

      {/* radial gauge + trend / provenance */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <RadialGauge rate={ratePct} target={pct(m.target)} color={s.color} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div className="tnum" style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", lineHeight: 1 }}>
              {m.numerator.toLocaleString()} <span style={{ color: "var(--muted)", fontWeight: 500 }}>/ {m.denominator.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>numerator / denominator</div>
          </div>
          <div>
            <div className="between" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
              <span>Rate trend</span>
              <span className="tnum">{m.trend.length} periods</span>
            </div>
            <Sparkline data={m.trend} color={s.color} w={150} h={32} />
          </div>
        </div>
      </div>

      {/* gap + reachable footers */}
      <div className="between" style={{ paddingTop: 12, borderTop: "1px solid var(--line-soft)", gap: 10 }}>
        <div style={{ display: "flex", gap: 18 }}>
          <button className="qm-gaplink" onClick={() => onViewGaps(m)} title="View care-gap roster">
            <div>
              <div className="tnum qm-gapnum" style={{ fontSize: 15, fontWeight: 600, color: m.gaps > 0 ? "var(--rose)" : "var(--ink)", lineHeight: 1 }}>
                {m.gaps.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, display: "flex", alignItems: "center", gap: 3 }}>
                open gaps<Icon name="chevR" size={11} />
              </div>
            </div>
          </button>
          <div>
            <div className="tnum" style={{ fontSize: 15, fontWeight: 600, color: "var(--canopy)", lineHeight: 1 }}>
              {m.reachable.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>reachable</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          <button className="cmd-ctrl" onClick={() => onViewGaps(m)}>
            <Icon name="users" size={14} />View gaps
          </button>
          <button className="cmd-ctrl" onClick={fire} disabled={gen} style={gen ? { color: "var(--muted)" } : undefined}>
            {gen ? <Spinner /> : <Icon name="bolt" size={14} />}
            {gen ? "Queuing…" : "Generate outreach"}
          </button>
        </div>
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

  const [open, setOpen] = React.useState<QualityMeasureRow | null>(null);
  const [outreach, setOutreach] = React.useState<Record<string, OutreachStatus>>({});
  const [bulkSending, setBulkSending] = React.useState(false);
  const [allSending, setAllSending] = React.useState(false);
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  React.useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const remindOne = (p: GapPatient) => {
    if (outreach[p.id]) return; // already sending or sent
    setOutreach((o) => ({ ...o, [p.id]: "sending" }));
    timers.current.push(setTimeout(() => {
      setOutreach((o) => ({ ...o, [p.id]: "sent" }));
      toast?.(`Outreach queued · ${p.name} (${mrnOf(p.id)})`);
    }, 900));
  };

  const remindAll = (roster: GapPatient[], m: QualityMeasureRow) => {
    if (bulkSending) return;
    const keys = roster.filter((p) => p.reachable).map((p) => p.id);
    if (!keys.length) return;
    setBulkSending(true);
    setOutreach((o) => {
      const next = { ...o };
      keys.forEach((k) => { if (next[k] !== "sent") next[k] = "sending"; });
      return next;
    });
    timers.current.push(setTimeout(() => {
      setOutreach((o) => {
        const next = { ...o };
        keys.forEach((k) => { next[k] = "sent"; });
        return next;
      });
      setBulkSending(false);
      toast?.(`Queued outreach for ${m.reachable.toLocaleString()} reachable patients — ${m.abbrev}`);
    }, 1200));
  };

  const generate = (m: QualityMeasureRow) =>
    toast?.(`Queued outreach for ${m.reachable.toLocaleString()} reachable patients — ${m.abbrev}`);

  const outreachAll = () => {
    if (allSending) return;
    setAllSending(true);
    timers.current.push(setTimeout(() => {
      setAllSending(false);
      toast?.(`Queued outreach for ${reachable.toLocaleString()} reachable patients across ${data.length} measures…`);
    }, 1200));
  };

  return (
    <div className="page">
      <style dangerouslySetInnerHTML={{ __html: QM_CSS }} />
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
          <button className="cmd-ctrl" onClick={outreachAll} disabled={allSending} style={allSending ? { color: "var(--muted)" } : undefined}>
            {allSending ? <Spinner size={15} /> : <Icon name="bolt" size={15} />}
            {allSending ? "Queuing…" : "Generate all outreach"}
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
          <MeasureCard key={m.id} m={m} onViewGaps={setOpen} onGenerate={generate} />
        ))}
      </div>

      {open && (
        <CareGapDrawer
          m={open}
          outreach={outreach}
          onRemind={remindOne}
          onRemindAll={(roster) => remindAll(roster, open)}
          bulkSending={bulkSending}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

export default QualitySurface;
