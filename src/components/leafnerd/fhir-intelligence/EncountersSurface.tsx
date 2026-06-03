"use client";
/* LEAFNERD — Clinical · Encounters list surface */
import React from "react";
import { Icon, Badge } from "./primitives";
import type { DrawerPayload } from "./Drawer";
import type { EncounterRow } from "@/lib/leafnerd/types";

const FALLBACK: EncounterRow[] = [
  { id: "enc-2041", patientId: "pt-10428", patientName: "Marisol Vega",    status: "complete",  modality: "in_person", scheduledFor: "2026-05-31T15:00:00Z", completedAt: "2026-05-31T15:38:00Z", reason: "Diabetes follow-up",        provider: "Dr. Reyes" },
  { id: "enc-2042", patientId: "pt-10571", patientName: "Darnell Brooks",  status: "complete",  modality: "video",     scheduledFor: "2026-05-29T18:30:00Z", completedAt: "2026-05-29T18:54:00Z", reason: "CHF telehealth check-in",  provider: "Dr. Adeyemi" },
  { id: "enc-2043", patientId: "pt-10733", patientName: "Priya Natarajan", status: "scheduled", modality: "in_person", scheduledFor: "2026-06-05T16:00:00Z", completedAt: null,                   reason: "Hypertension recheck",     provider: "Dr. Reyes" },
  { id: "enc-2044", patientId: "pt-11022", patientName: "Hana Schmidt",    status: "complete",  modality: "phone",     scheduledFor: "2026-05-26T20:15:00Z", completedAt: "2026-05-26T20:31:00Z", reason: "Cannabis titration review", provider: "Dr. Patel" },
  { id: "enc-2045", patientId: "pt-10890", patientName: "Theodore Okafor", status: "no_show",   modality: "in_person", scheduledFor: "2026-05-22T14:45:00Z", completedAt: null,                   reason: "Post-MI cardiology",       provider: "Dr. Adeyemi" },
];

const MODALITY_LABEL: Record<string, string> = { in_person: "In person", video: "Video", phone: "Phone" };

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s === "complete" || s === "completed" || s === "finished") return "green";
  if (s === "scheduled" || s === "booked" || s === "in_progress") return "indigo";
  if (s === "no_show" || s === "cancelled" || s === "canceled") return "rose";
  return "gray";
}

function modalityTone(modality: string): string {
  const m = modality.toLowerCase();
  if (m === "video") return "indigo";
  if (m === "phone") return "amber";
  return "green";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildPayload(row: EncounterRow): DrawerPayload {
  return {
    kind: "record" as DrawerPayload["kind"],
    tag: "Encounter",
    title: row.reason ?? "Office visit",
    sub: (
      <React.Fragment>
        {row.patientName}
        <span className="dotsep">·</span>
        {MODALITY_LABEL[row.modality] ?? row.modality}
      </React.Fragment>
    ),
    render: () => (
      <React.Fragment>
        <div className="norm-section">
          <div className="nh">Encounter</div>
          <div className="norm-card">
            <dl className="kv">
              <dt>Patient</dt><dd>{row.patientName}</dd>
              <dt>Reason</dt><dd>{row.reason ?? "—"}</dd>
              <dt>Modality</dt><dd><Badge tone={modalityTone(row.modality)} dot={false}>{MODALITY_LABEL[row.modality] ?? row.modality}</Badge></dd>
              <dt>Status</dt><dd><Badge tone={statusTone(row.status)} dot={false}>{statusLabel(row.status)}</Badge></dd>
              <dt>Provider</dt><dd>{row.provider ?? "—"}</dd>
            </dl>
          </div>
        </div>
        <div className="norm-section">
          <div className="nh">Timing</div>
          <div className="norm-card">
            <dl className="kv">
              <dt>Scheduled</dt><dd>{fmtDate(row.scheduledFor)}</dd>
              <dt>Completed</dt><dd>{fmtDate(row.completedAt)}</dd>
              <dt>Encounter ID</dt><dd className="mono">{row.id}</dd>
            </dl>
          </div>
        </div>
      </React.Fragment>
    ),
  };
}

export function EncountersSurface({
  rows,
  openRecord,
}: {
  rows?: EncounterRow[];
  openRecord: (p: DrawerPayload) => void;
}) {
  const data = rows && rows.length ? rows : FALLBACK;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Clinical</div>
          <h1 className="page-title">Encounters</h1>
          <p className="page-lede">
            Every visit normalized to a FHIR Encounter — in-person, video, and phone — with status,
            reason, and completion captured for quality measures and utilization analytics.
          </p>
        </div>
      </div>
      <div className="tbl-wrap">
        <div className="tbl-tools">
          <button className="chip on">Last 30 days <span className="x">×</span></button>
          <button className="chip"><Icon name="plus" size={13} />Add filter</button>
        </div>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Reason</th>
                <th>Modality</th>
                <th>Status</th>
                <th>Completed</th>
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
                  <td><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{row.reason ?? "—"}</span></td>
                  <td><Badge tone={modalityTone(row.modality)} dot={false}>{MODALITY_LABEL[row.modality] ?? row.modality}</Badge></td>
                  <td><Badge tone={statusTone(row.status)} dot={false}>{statusLabel(row.status)}</Badge></td>
                  <td><span className="muted" style={{ fontSize: 12.5 }}>{fmtDate(row.completedAt)}</span></td>
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
