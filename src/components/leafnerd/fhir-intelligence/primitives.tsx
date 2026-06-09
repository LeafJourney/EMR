"use client";

import { useId } from "react";
import type { CSSProperties } from "react";

/* LEAFNERD — icons */
export function Icon({
  name,
  size = 18,
  className = "",
  style = {},
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const P: Record<string, string> = {
    grid:      "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
    users:     "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 7a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z|M22 21v-2a4 4 0 0 0-3-3.87|M16 3.13A4 4 0 0 1 16 11",
    calendar:  "M3 4h18v18H3zM3 9h18M8 2v4M16 2v4",
    activity:  "M22 12h-4l-3 9L9 3l-3 9H2",
    clipboard: "M9 4h6v3H9zM7 4H5v18h14V4h-2",
    pill:      "M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7",
    flask:     "M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10",
    receipt:   "M5 2v20l2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1zM8 7h8M8 11h8M8 15h5",
    check:     "M20 6 9 17l-5-5",
    pulse:     "M3 12h4l2-7 4 14 2-7h6",
    chart:     "M3 3v18h18M7 14v4M12 9v9M17 5v13",
    spark:     "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
    gear:      "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z|M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 6.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 .7 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
    git:       "M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 9v6M18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 15a9 9 0 0 0-9-9",
    shield:    "M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5z|M9 12l2 2 4-4",
    target:    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z|M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
    search:    "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
    clock:     "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 7v5l3 2",
    source:    "M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
    x:         "M18 6 6 18M6 6l12 12",
    chevR:     "M9 18l6-6-6-6",
    chevD:     "M6 9l6 6 6-6",
    arrowUp:   "M12 19V5M5 12l7-7 7 7",
    arrowDown: "M12 5v14M19 12l-7 7-7-7",
    arrowR:    "M5 12h14M13 5l7 7-7 7",
    trendUp:   "M22 7 13.5 15.5l-4-4L2 19M16 7h6v6",
    alert:     "M12 2 1 21h22zM12 9v5M12 18h.01",
    info:      "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 11v5M12 8h.01",
    bolt:      "M13 2 4 14h7l-1 8 9-12h-7z",
    layers:    "M12 2 2 7l10 5 10-5zM2 12l10 5 10-5M2 17l10 5 10-5",
    download:  "M12 3v12M7 11l5 5 5-5M5 21h14",
    filter:    "M3 4h18l-7 8v6l-4 2v-8z",
    plus:      "M12 5v14M5 12h14",
    eye:       "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    book:      "M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2zM4 4v16",
    code:      "M8 6 2 12l6 6M16 6l6 6-6 6",
    dot:       "M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
    logout:    "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9",
    pause:     "M7 4h3v16H7zM14 4h3v16h-3z",
    play:      "M7 4l13 8-13 8z",
    refresh:   "M21 12a9 9 0 1 1-2.6-6.4M21 4v4h-4",
  };
  const d = P[name];
  if (!d) return null;
  const segs = d.split("|");
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={style}>
      {segs.map((s, i) => <path key={i} d={s} />)}
    </svg>
  );
}

export function Badge({
  tone = "gray",
  children,
  dot = true,
  mono = false,
  outline = false,
}: {
  tone?: string;
  children?: React.ReactNode;
  dot?: boolean;
  mono?: boolean;
  outline?: boolean;
}) {
  return <span className={`badge ${tone} ${mono ? "mono" : ""} ${outline ? "outline" : ""}`}>
    {dot && !outline && <span className="bd"></span>}{children}
  </span>;
}

/* confidence meter */
export function Conf({
  value,
  showPct = true,
}: {
  value: number;
  showPct?: boolean;
}) {
  const pct = Math.round(value * 100);
  const color = value >= 0.85 ? "var(--canopy)" : value >= 0.65 ? "var(--amber)" : "var(--rose)";
  return <span className="conf">
    <span className="track"><span className="fill" style={{ width: pct + "%", background: color }}></span></span>
    {showPct && <span className="tnum" style={{ fontSize: 11.5, color: "var(--muted)" }}>{pct}%</span>}
  </span>;
}

/* sparkline */
export function Sparkline({
  data,
  w = 90,
  h = 30,
  color = "var(--c-canopy)",
  fill = true,
}: {
  data: number[];
  w?: number;
  h?: number;
  color?: string;
  fill?: boolean;
}) {
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const pts = data.map((v, i) => [ (i / (data.length - 1)) * w, h - 3 - ((v - min) / rng) * (h - 6) ]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L${w} ${h} L0 ${h} Z`;
  const rawId = useId();
  const id = rawId.replace(/:/g, "");
  return <svg className="mini-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
    {fill && <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={color} stopOpacity="0.18" /><stop offset="1" stopColor={color} stopOpacity="0" />
    </linearGradient></defs>}
    {fill && <path d={area} fill={`url(#${id})`} />}
    <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={color} />
  </svg>;
}

/* radial gauge */
export function Gauge({
  value,
  size = 92,
  label,
  color = "var(--c-canopy)",
}: {
  value: number;
  size?: number;
  label?: string;
  color?: string;
}) {
  const r = size / 2 - 8, c = 2 * Math.PI * r, off = c * (1 - value / 100);
  return <div style={{ position: "relative", width: size, height: size }}>
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--cream-deep)" strokeWidth="7" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset .8s cubic-bezier(.22,.61,.36,1)" }} />
    </svg>
    <div style={{ position:"absolute", inset:0, display:"grid", placeItems:"center", textAlign:"center" }}>
      <div>
        <div className="tnum" style={{ fontSize: size*0.26, fontWeight:600, letterSpacing:"-.03em", lineHeight:1 }}>{value}<span style={{fontSize:size*0.14,color:"var(--muted)"}}>%</span></div>
        {label && <div style={{ fontSize:10, color:"var(--muted)", marginTop:2 }}>{label}</div>}
      </div>
    </div>
  </div>;
}

/* horizontal bars (domain completeness) */
export function BarsH({ data }: { data: { name: string; pct: number }[] }) {
  return <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
    {data.map((d, i) => {
      const color = d.pct >= 85 ? "var(--c-canopy)" : d.pct >= 70 ? "var(--c-sage)" : "var(--c-amber)";
      return <div key={i} style={{ display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:104, fontSize:12.5, color:"var(--ink-2)", flex:"none" }}>{d.name}</div>
        <div style={{ flex:1, height:8, background:"var(--cream-deep)", borderRadius:5, overflow:"hidden" }}>
          <div style={{ width:d.pct+"%", height:"100%", background:color, borderRadius:5, transition:"width .7s ease" }}></div>
        </div>
        <div className="tnum" style={{ width:34, textAlign:"right", fontSize:12.5, fontWeight:550, color: d.pct<70?"var(--amber)":"var(--ink)" }}>{d.pct}%</div>
      </div>;
    })}
  </div>;
}

/* area / line chart with axis */
export function AreaChart({
  data,
  w = 560,
  h = 180,
  color = "var(--c-canopy)",
  labels = [],
  yMax,
}: {
  data: number[];
  w?: number;
  h?: number;
  color?: string;
  labels?: string[];
  yMax?: number;
}) {
  const pad = { l: 4, r: 4, t: 10, b: 22 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = yMax || Math.max(...data) * 1.12, min = 0;
  const X = (i: number) => pad.l + (i / (data.length - 1)) * iw;
  const Y = (v: number) => pad.t + ih - ((v - min) / (max - min)) * ih;
  const line = data.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
  const area = line + ` L${X(data.length-1)} ${pad.t+ih} L${X(0)} ${pad.t+ih} Z`;
  const rawId = useId();
  const id = rawId.replace(/:/g, "");
  const grid = [0, 0.5, 1];
  return <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display:"block" }}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={color} stopOpacity="0.22" /><stop offset="1" stopColor={color} stopOpacity="0.01" />
    </linearGradient></defs>
    {grid.map((g, i) => { const y = pad.t + ih * g; return <line key={i} x1={pad.l} y1={y} x2={w-pad.r} y2={y} stroke="var(--c-grid)" strokeWidth="1" strokeDasharray={i===2?"0":"3 4"} />; })}
    <path d={area} fill={`url(#${id})`} />
    <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    {data.map((v, i) => <circle key={i} cx={X(i)} cy={Y(v)} r="2.4" fill="var(--paper)" stroke={color} strokeWidth="1.6" />)}
    {labels.map((l, i) => <text key={i} x={X(i)} y={h-6} fontSize="10.5" fill="var(--muted)" textAnchor="middle" fontFamily="var(--mono)">{l}</text>)}
  </svg>;
}
