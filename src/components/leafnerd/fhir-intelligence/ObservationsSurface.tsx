"use client";
/* LEAFNERD — Clinical · Observations list surface */
import React from "react";
import { Icon, Badge } from "./primitives";
import type { DrawerPayload } from "./Drawer";
import type { ObservationRow } from "@/lib/leafnerd/types";

const FALLBACK: ObservationRow[] = [
  { id: "obs-3001", patientId: "pt-10428", patientName: "Marisol Vega",    category: "Laboratory", severity: "urgent",  summary: "HbA1c 9.4% — markedly above goal",     createdAt: "2026-05-30T13:20:00Z", loinc: "4548-4",  value: "9.4",    unit: "%",      actionSuggested: "Escalate to care manager; intensify glycemic plan" },
  { id: "obs-3002", patientId: "pt-10571", patientName: "Darnell Brooks",  category: "Vital signs", severity: "concern", summary: "BP 162/98 — stage 2 hypertension",     createdAt: "2026-05-29T18:50:00Z", loinc: "85354-9", value: "162/98", unit: "mmHg",   actionSuggested: "Confirm medication adherence; recheck in 1 week" },
  { id: "obs-3003", patientId: "pt-11022", patientName: "Hana Schmidt",    category: "Survey",      severity: "notable", summary: "Pain score 6/10 post-titration",       createdAt: "2026-05-26T20:35:00Z", loinc: "72514-3", value: "6",      unit: "{score}", actionSuggested: "Reassess dosage at next check-in" },
  { id: "obs-3004", patientId: "pt-10733", patientName: "Priya Natarajan", category: "Laboratory", severity: "info",    summary: "LDL 96 mg/dL — within target",         createdAt: "2026-05-24T11:05:00Z", loinc: "13457-7", value: "96",     unit: "mg/dL",  actionSuggested: null },
  { id: "obs-3005", patientId: "pt-10890", patientName: "Theodore Okafor", category: "Vital signs", severity: "info",    summary: "Resting HR 68 bpm — normal sinus",     createdAt: "2026-05-22T15:00:00Z", loinc: "8867-4",  value: "68",     unit: "bpm",    actionSuggested: null },
  { id: "obs-3006", patientId: "pt-11187", patientName: "Luis Carrillo",   category: "Survey",      severity: "notable", summary: "Sleep quality dropped to 4/10",        createdAt: "2026-05-20T07:40:00Z", loinc: "72514-3", value: "4",      unit: "{score}", actionSuggested: "Flag for sleep-focused outreach" },
];

function severityTone(severity: string): string {
  const s = severity.toLowerCase();
  if (s === "urgent" || s === "concern") return "rose";
  if (s === "notable") return "amber";
  return "green";
}

function severityLabel(severity: string): string {
  return severity.replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function buildPayload(row: ObservationRow): DrawerPayload {
  const valueText = row.value != null ? `${row.value}${row.unit ? ` ${row.unit}` : ""}` : null;
  return {
    kind: "record" as DrawerPayload["kind"],
    tag: "Observation",
    title: row.summary,
    sub: (
      <React.Fragment>
        {row.patientName}
        <span className="dotsep">·</span>
        {row.category}
      </React.Fragment>
    ),
    render: () => (
      <React.Fragment>
        <div className="norm-section">
          <div className="nh">Observation</div>
          <div className="norm-card">
            <dl className="kv">
              <dt>Patient</dt><dd>{row.patientName}</dd>
              <dt>Summary</dt><dd>{row.summary}</dd>
              <dt>Category</dt><dd>{row.category}</dd>
              <dt>Severity</dt><dd><Badge tone={severityTone(row.severity)} dot={false}>{severityLabel(row.severity)}</Badge></dd>
              <dt>When</dt><dd>{fmtDate(row.createdAt)}</dd>
            </dl>
          </div>
        </div>
        {(row.loinc || valueText) && (
          <div className="norm-section">
            <div className="nh">Coded value</div>
            <div className="norm-card">
              <dl className="kv">
                {row.loinc && <React.Fragment><dt>LOINC</dt><dd className="mono">{row.loinc}</dd></React.Fragment>}
                {valueText && <React.Fragment><dt>Value</dt><dd className="tnum">{valueText}</dd></React.Fragment>}
              </dl>
            </div>
          </div>
        )}
        {row.actionSuggested && (
          <div className="norm-section">
            <div className="nh">Suggested action</div>
            <div className="norm-card">
              <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{row.actionSuggested}</div>
            </div>
          </div>
        )}
      </React.Fragment>
    ),
  };
}

export function ObservationsSurface({
  rows,
  openRecord,
}: {
  rows?: ObservationRow[];
  openRecord: (p: DrawerPayload) => void;
}) {
  const data = rows && rows.length ? rows : FALLBACK;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Clinical</div>
          <h1 className="page-title">Observations</h1>
          <p className="page-lede">
            Labs, vitals, and patient-reported outcomes normalized to FHIR Observations — each coded
            to LOINC, severity-triaged, and paired with a suggested next step.
          </p>
        </div>
      </div>
      <div className="tbl-wrap">
        <div className="tbl-tools">
          <button className="chip on">Severity ≥ Notable <span className="x">×</span></button>
          <button className="chip"><Icon name="plus" size={13} />Add filter</button>
        </div>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Observation</th>
                <th>Category</th>
                <th>Severity</th>
                <th>When</th>
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} onClick={() => openRecord(buildPayload(row))}>
                  <td>
                    <div className="pt-name">{row.patientName}</div>
                    <div className="pt-id">{row.patientId}</div>
                  </td>
                  <td><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{row.summary}</span></td>
                  <td><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{row.category}</span></td>
                  <td><Badge tone={severityTone(row.severity)} dot={false}>{severityLabel(row.severity)}</Badge></td>
                  <td><span className="muted" style={{ fontSize: 12.5 }}>{fmtDate(row.createdAt)}</span></td>
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
