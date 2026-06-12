"use client";
/* LEAFNERD — Clinical rail surface: Conditions */
import React from "react";
import { Icon, Badge } from "./primitives";
import type { DrawerPayload } from "./Drawer";
import type { ConditionRow } from "@/lib/leafnerd/types";

const FALLBACK: ConditionRow[] = [
  { id: "cond-001", patientId: "pt-1042", patientName: "Marcus Hale", condition: "Type 2 diabetes mellitus", onsetYear: 2018, source: "EHR · ICD-10 E11.9", notes: "Diet-controlled until 2021; metformin initiated. Last HbA1c 7.8% — above goal." },
  { id: "cond-002", patientId: "pt-0871", patientName: "Priya Nair", condition: "Generalized anxiety disorder", onsetYear: 2020, source: "EHR · ICD-10 F41.1", notes: "Managing with CBT and as-needed cannabis tincture. GAD-7 trending down." },
  { id: "cond-003", patientId: "pt-1190", patientName: "Devon Brooks", condition: "Chronic lower back pain", onsetYear: 2016, source: "Claims · ICD-10 M54.5", notes: "Post-MVA. On a multimodal plan; opioid-sparing goal documented." },
  { id: "cond-004", patientId: "pt-0455", patientName: "Aisha Rahman", condition: "Essential hypertension", onsetYear: 2014, source: "EHR · ICD-10 I10", notes: "Stage 1. Home BP log uploaded weekly; lifestyle plus lisinopril 10mg." },
  { id: "cond-005", patientId: "pt-1322", patientName: "Owen Castellano", condition: "Insomnia, unspecified", onsetYear: 2022, source: "EHR · ICD-10 G47.00", notes: "Sleep onset latency >45 min. Evaluating CBN-forward regimen." },
  { id: "cond-006", patientId: "pt-0608", patientName: "Lena Fischer", condition: "Migraine without aura", onsetYear: 2011, source: "EHR · ICD-10 G43.009", notes: "4-6 episodes/month. Tracking triggers in the post-dose check-in." },
];

export function ConditionsSurface({ rows, openRecord, toast }: { rows?: ConditionRow[]; openRecord: (p: DrawerPayload) => void; toast?: (m: string) => void }) {
  const data = rows && rows.length ? rows : FALLBACK;

  const open = (row: ConditionRow) =>
    openRecord({
      kind: "record" as DrawerPayload["kind"],
      tag: "Condition",
      title: row.condition,
      sub: (
        <React.Fragment>
          {row.patientName}
          <span className="dotsep">·</span>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{row.patientId}</span>
          {row.onsetYear && <React.Fragment><span className="dotsep">·</span>Onset {row.onsetYear}</React.Fragment>}
        </React.Fragment>
      ),
      render: () => (
        <React.Fragment>
          <div className="norm-section">
            <div className="nh">Clinical detail</div>
            <div className="norm-card">
              <dl className="kv">
                <dt>Patient</dt><dd>{row.patientName}</dd>
                <dt>Condition</dt><dd>{row.condition}</dd>
                <dt>Onset</dt><dd>{row.onsetYear ?? "—"}</dd>
                <dt>Source</dt><dd>{row.source ?? "—"}</dd>
              </dl>
            </div>
          </div>
          <div className="norm-section">
            <div className="nh">Notes</div>
            <div className="norm-card">
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>
                {row.notes ?? "No clinical notes recorded for this condition."}
              </div>
            </div>
          </div>
        </React.Fragment>
      ),
    });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Clinical</div>
          <h1 className="page-title">Conditions</h1>
          <p className="page-lede">Active and historical problem-list entries across the cohort, normalized to ICD-10 with source provenance on every diagnosis.</p>
        </div>
      </div>

      <div className="tbl-wrap">
        <div className="tbl-tools">
          <button className="chip on">Problem list <span className="x">×</span></button>
          <button className="chip" onClick={() => toast?.("Filter builder — add ICD-10 chapter, onset range, or source conditions")}><Icon name="plus" size={13} />Add filter</button>
          <div style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)" }}>{data.length} conditions</div>
        </div>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Condition</th>
                <th>Onset</th>
                <th>Source</th>
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr
                  key={row.id}
                  onClick={() => open(row)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(row); } }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open ${row.patientName} — ${row.condition}`}
                >
                  <td>
                    <div className="pt-name">{row.patientName}</div>
                    <div className="pt-id">{row.patientId}</div>
                  </td>
                  <td><span style={{ fontSize: 12.5, color: "var(--ink)" }}>{row.condition}</span></td>
                  <td><span className="tnum" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{row.onsetYear ?? "—"}</span></td>
                  <td><span className="muted" style={{ fontSize: 12 }}>{row.source ?? "—"}</span></td>
                  <td><span className="row-action"><Icon name="chevR" size={15} /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
