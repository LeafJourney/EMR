"use client";
/* LEAFNERD — Clinical rail surface: Medications (with RxNorm mapping story) */
import React from "react";
import { Icon, Badge } from "./primitives";
import type { DrawerPayload } from "./Drawer";
import type { MedicationRow } from "@/lib/leafnerd/types";

const FALLBACK: MedicationRow[] = [
  { id: "med-001", patientId: "pt-1042", patientName: "Marcus Hale", name: "Metformin", genericName: "metformin hydrochloride", type: "prescription", dosage: "1000 mg PO BID", prescriber: "Dr. Reyes", unmapped: false, notes: "RxNorm 860975 · titrated for glycemic control." },
  { id: "med-002", patientId: "pt-0871", patientName: "Priya Nair", name: "Sertraline", genericName: "sertraline", type: "prescription", dosage: "50 mg PO daily", prescriber: "Dr. Okafor", unmapped: false, notes: "RxNorm 312941 · SSRI for GAD." },
  { id: "med-003", patientId: "pt-1190", patientName: "Devon Brooks", name: "LeafJourney Balance 10:10", genericName: null, type: "cannabis", dosage: "1 mL sublingual QHS", prescriber: "Dr. Patel", unmapped: true, notes: "Local vocab code MTF1000 — unmapped to RxNorm. Captured from intake; excluded from interaction checks until reviewed." },
  { id: "med-004", patientId: "pt-0455", patientName: "Aisha Rahman", name: "Lisinopril", genericName: "lisinopril", type: "prescription", dosage: "10 mg PO daily", prescriber: "Dr. Reyes", unmapped: false, notes: "RxNorm 314076 · ACE inhibitor." },
  { id: "med-005", patientId: "pt-1322", patientName: "Owen Castellano", name: "CBN Night Drops", genericName: null, type: "cannabis", dosage: "0.5 mL sublingual QHS", prescriber: "Dr. Patel", unmapped: true, notes: "Local vocab code unmapped — proprietary CBN formulation has no RxNorm concept; needs steward review." },
  { id: "med-006", patientId: "pt-0608", patientName: "Lena Fischer", name: "Magnesium glycinate", genericName: "magnesium glycinate", type: "supplement", dosage: "200 mg PO QHS", prescriber: "Self-reported", unmapped: false, notes: "RxNorm 644316 · OTC supplement, migraine prophylaxis." },
];

const TYPE_TONE: Record<string, string> = {
  prescription: "indigo",
  otc: "gray",
  supplement: "lime",
  cannabis: "green",
};

export function MedicationsSurface({ rows, openRecord }: { rows?: MedicationRow[]; openRecord: (p: DrawerPayload) => void }) {
  const all = rows && rows.length ? rows : FALLBACK;
  const [onlyUnmapped, setOnlyUnmapped] = React.useState(false);
  const data = onlyUnmapped ? all.filter(r => r.unmapped) : all;

  const open = (row: MedicationRow) =>
    openRecord({
      kind: "record" as DrawerPayload["kind"],
      tag: "Medication",
      title: row.name,
      sub: (
        <React.Fragment>
          {row.patientName}
          <span className="dotsep">·</span>
          <Badge tone={TYPE_TONE[row.type] || "gray"} dot={false}>{row.type}</Badge>
          {row.unmapped && <React.Fragment><span className="dotsep">·</span><Badge tone="rose" dot={false}>unmapped</Badge></React.Fragment>}
        </React.Fragment>
      ),
      render: (_tab, toast) => (
        <React.Fragment>
          <div className="norm-section">
            <div className="nh">Medication detail</div>
            <div className="norm-card">
              <dl className="kv">
                <dt>Patient</dt><dd>{row.patientName}</dd>
                <dt>Medication</dt><dd>{row.name}</dd>
                <dt>Generic</dt><dd>{row.genericName ?? "—"}</dd>
                <dt>Type</dt><dd><Badge tone={TYPE_TONE[row.type] || "gray"} dot={false}>{row.type}</Badge></dd>
                <dt>Dosage</dt><dd>{row.dosage ?? "—"}</dd>
                <dt>Prescriber</dt><dd>{row.prescriber ?? "—"}</dd>
                <dt>Mapping</dt><dd>{row.unmapped ? <Badge tone="rose" dot={false}>unmapped</Badge> : <Badge tone="green" dot={false}>RxNorm</Badge>}</dd>
              </dl>
            </div>
          </div>

          {row.notes && (
            <div className="norm-section">
              <div className="nh">Notes</div>
              <div className="norm-card">
                <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>{row.notes}</div>
              </div>
            </div>
          )}

          {row.unmapped && (
            <div className="norm-section">
              <div className="nh" style={{ color: "var(--rose)" }}>Action needed — map to RxNorm</div>
              <div className="norm-card" style={{ background: "var(--rose-soft)", borderColor: "#e3c3bb" }}>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "#7c2f22" }}>
                  <b>{row.name}</b> uses an unrecognized local code and never resolved to an RxNorm concept. Until a steward maps it, this medication is excluded from interaction checks and quality measures.
                </div>
                <button className="insight-action" style={{ marginTop: 12, background: "var(--rose)" }} onClick={() => toast("Opened RxNorm mapping assistant…")}>
                  <Icon name="bolt" size={14} />Map to RxNorm
                </button>
              </div>
            </div>
          )}
        </React.Fragment>
      ),
    });

  const unmappedCount = all.filter(r => r.unmapped).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Clinical</div>
          <h1 className="page-title">Medications</h1>
          <p className="page-lede">Active medication requests across the cohort. Local codes are mapped to RxNorm so the list stays usable for interaction checks and quality measures.</p>
        </div>
      </div>

      <div className="tbl-wrap">
        <div className="tbl-tools">
          <button className={`chip${onlyUnmapped ? "" : " on"}`} onClick={() => setOnlyUnmapped(false)}>All medications{!onlyUnmapped && <> <span className="x">×</span></>}</button>
          {unmappedCount > 0 && <button className={`chip${onlyUnmapped ? " on" : ""}`} onClick={() => setOnlyUnmapped(true)}><Icon name="alert" size={13} />{unmappedCount} unmapped</button>}
          <div style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)" }}>{data.length} medications</div>
        </div>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Medication</th>
                <th>Type</th>
                <th>Dosage</th>
                <th>Prescriber</th>
                <th>Mapping</th>
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
                  <td>
                    <div style={{ fontSize: 12.5, color: "var(--ink)" }}>{row.name}</div>
                    {row.genericName && <div className="muted" style={{ fontSize: 11.5 }}>{row.genericName}</div>}
                  </td>
                  <td><Badge tone={TYPE_TONE[row.type] || "gray"} dot={false}>{row.type}</Badge></td>
                  <td><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{row.dosage ?? "—"}</span></td>
                  <td><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{row.prescriber ?? "—"}</span></td>
                  <td>{row.unmapped ? <Badge tone="rose" dot={false}>unmapped</Badge> : <Badge tone="green" dot={false}>RxNorm</Badge>}</td>
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
