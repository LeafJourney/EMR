"use client";
/* LEAFNERD — Clinical rail surface: Labs */
import React from "react";
import { Icon, Badge } from "./primitives";
import type { DrawerPayload } from "./Drawer";
import type { LabRow } from "@/lib/leafnerd/types";

const FALLBACK: LabRow[] = [
  {
    id: "lab-001", patientId: "pt-1042", patientName: "Marcus Hale", panelName: "HbA1c panel",
    receivedAt: "2026-05-28", abnormalFlag: true, reviewOutcome: "Provider review pending",
    markers: [
      { name: "Hemoglobin A1c", value: 7.8, unit: "%", abnormal: true },
      { name: "Estimated avg glucose", value: 177, unit: "mg/dL", abnormal: true },
    ],
  },
  {
    id: "lab-002", patientId: "pt-0455", patientName: "Aisha Rahman", panelName: "Basic metabolic panel",
    receivedAt: "2026-05-30", abnormalFlag: false, reviewOutcome: "Reviewed — within range",
    markers: [
      { name: "Sodium", value: 140, unit: "mmol/L" },
      { name: "Potassium", value: 4.2, unit: "mmol/L" },
      { name: "Creatinine", value: 0.9, unit: "mg/dL" },
      { name: "Glucose", value: 96, unit: "mg/dL" },
    ],
  },
  {
    id: "lab-003", patientId: "pt-1190", patientName: "Devon Brooks", panelName: "Lipid panel",
    receivedAt: "2026-05-22", abnormalFlag: true, reviewOutcome: "Flagged — LDL elevated",
    markers: [
      { name: "Total cholesterol", value: 232, unit: "mg/dL", abnormal: true },
      { name: "LDL", value: 158, unit: "mg/dL", abnormal: true },
      { name: "HDL", value: 44, unit: "mg/dL" },
      { name: "Triglycerides", value: 150, unit: "mg/dL" },
    ],
  },
  {
    id: "lab-004", patientId: "pt-0871", patientName: "Priya Nair", panelName: "Complete blood count",
    receivedAt: "2026-05-31", abnormalFlag: false, reviewOutcome: "Reviewed — within range",
    markers: [
      { name: "WBC", value: 6.4, unit: "10^3/µL" },
      { name: "Hemoglobin", value: 13.6, unit: "g/dL" },
      { name: "Platelets", value: 248, unit: "10^3/µL" },
    ],
  },
  {
    id: "lab-005", patientId: "pt-1322", patientName: "Owen Castellano", panelName: "Thyroid panel",
    receivedAt: "2026-05-26", abnormalFlag: true, reviewOutcome: "Flagged — TSH high",
    markers: [
      { name: "TSH", value: 6.1, unit: "mIU/L", abnormal: true },
      { name: "Free T4", value: 1.1, unit: "ng/dL" },
    ],
  },
  {
    id: "lab-006", patientId: "pt-0608", patientName: "Lena Fischer", panelName: "Vitamin D, 25-OH",
    receivedAt: "2026-05-19", abnormalFlag: true, reviewOutcome: "Flagged — deficient",
    markers: [
      { name: "25-hydroxyvitamin D", value: 18, unit: "ng/mL", abnormal: true },
    ],
  },
  {
    id: "lab-007", patientId: "pt-1042", patientName: "Marcus Hale", panelName: "Comprehensive metabolic panel",
    receivedAt: "2026-05-15", abnormalFlag: false, reviewOutcome: "Reviewed — within range",
    markers: [
      { name: "ALT", value: 28, unit: "U/L" },
      { name: "AST", value: 24, unit: "U/L" },
      { name: "Albumin", value: 4.4, unit: "g/dL" },
      { name: "Calcium", value: 9.5, unit: "mg/dL" },
    ],
  },
  {
    id: "lab-008", patientId: "pt-0455", patientName: "Aisha Rahman", panelName: "Hemoglobin A1c",
    receivedAt: "2026-05-12", abnormalFlag: false, reviewOutcome: "Reviewed — at goal",
    markers: [
      { name: "Hemoglobin A1c", value: 5.6, unit: "%" },
    ],
  },
];

export function LabsSurface({ rows, openRecord }: { rows?: LabRow[]; openRecord: (p: DrawerPayload) => void }) {
  const data = rows && rows.length ? rows : FALLBACK;

  const open = (row: LabRow) =>
    openRecord({
      kind: "record" as DrawerPayload["kind"],
      tag: "Lab result",
      title: row.panelName,
      sub: (
        <React.Fragment>
          {row.patientName}
          <span className="dotsep">·</span>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{row.patientId}</span>
          {row.abnormalFlag && <React.Fragment><span className="dotsep">·</span><Badge tone="rose" dot={false}>abnormal</Badge></React.Fragment>}
        </React.Fragment>
      ),
      render: () => (
        <React.Fragment>
          <div className="norm-section">
            <div className="nh">Result detail</div>
            <div className="norm-card">
              <dl className="kv">
                <dt>Patient</dt><dd>{row.patientName}</dd>
                <dt>Panel</dt><dd>{row.panelName}</dd>
                <dt>Received</dt><dd>{row.receivedAt ?? "—"}</dd>
                <dt>Flag</dt><dd>{row.abnormalFlag ? <Badge tone="rose" dot={false}>abnormal</Badge> : <Badge tone="green" dot={false}>normal</Badge>}</dd>
                <dt>Review</dt><dd>{row.reviewOutcome ?? "—"}</dd>
              </dl>
            </div>
          </div>
          <div className="norm-section">
            <div className="nh">Markers ({row.markers.length})</div>
            <div className="norm-card">
              <dl className="kv">
                {row.markers.map((m, i) => (
                  <React.Fragment key={i}>
                    <dt style={m.abnormal ? { color: "var(--rose)" } : undefined}>{m.name}</dt>
                    <dd style={m.abnormal ? { color: "var(--rose)", fontWeight: 600 } : undefined} className="tnum">
                      {m.value}{m.unit ? ` ${m.unit}` : ""}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
          </div>
        </React.Fragment>
      ),
    });

  const abnormalCount = data.filter(r => r.abnormalFlag).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Clinical</div>
          <h1 className="page-title">Labs</h1>
          <p className="page-lede">Incoming lab panels across the cohort. Abnormal results are flagged for review with marker-level detail and provenance.</p>
        </div>
      </div>

      <div className="tbl-wrap">
        <div className="tbl-tools">
          <button className="chip on">All panels <span className="x">×</span></button>
          {abnormalCount > 0 && <button className="chip"><Icon name="alert" size={13} />{abnormalCount} abnormal</button>}
          <div style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)" }}>{data.length} results</div>
        </div>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Panel</th>
                <th>Received</th>
                <th>Flag</th>
                <th>Review</th>
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.id} onClick={() => open(row)}>
                  <td>
                    <div className="pt-name">{row.patientName}</div>
                    <div className="pt-id">{row.patientId}</div>
                  </td>
                  <td><span style={{ fontSize: 12.5, color: "var(--ink)" }}>{row.panelName}</span></td>
                  <td><span className="muted" style={{ fontSize: 12.5 }}>{row.receivedAt ?? "—"}</span></td>
                  <td>{row.abnormalFlag ? <Badge tone="rose" dot={false}>abnormal</Badge> : <Badge tone="green" dot={false}>normal</Badge>}</td>
                  <td><span style={{ fontSize: 12, color: "var(--ink-2)" }}>{row.reviewOutcome ?? "—"}</span></td>
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
