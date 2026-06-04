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
