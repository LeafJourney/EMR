"use client";
/* LEAFNERD — Clinical · Patients list surface */
import { PatientTable } from "./widgets";
import type { PatientRow } from "@/lib/leafnerd/types";

const FALLBACK: PatientRow[] = [
  { name: "Marisol Vega",      id: "pt-10428", age: 64, sex: "F", risk: "Critical", score: 0.91, hcc: 2.84, gaps: 4, cohort: "Diabetes · CKD stage 3", lastEnc: "2d",  source: "EHR",      match: 0.98 },
  { name: "Darnell Brooks",    id: "pt-10571", age: 58, sex: "M", risk: "High",     score: 0.82, hcc: 2.31, gaps: 3, cohort: "CHF · COPD",            lastEnc: "5d",  source: "Claims",   match: 0.94 },
  { name: "Priya Natarajan",   id: "pt-10733", age: 47, sex: "F", risk: "High",     score: 0.77, hcc: 1.96, gaps: 2, cohort: "Hypertension · obesity",  lastEnc: "9d",  source: "EHR",      match: 0.96 },
  { name: "Theodore Okafor",   id: "pt-10890", age: 71, sex: "M", risk: "Moderate", score: 0.61, hcc: 1.74, gaps: 2, cohort: "Post-MI · statin therapy", lastEnc: "3w",  source: "EHR",      match: 0.91 },
  { name: "Hana Schmidt",      id: "pt-11022", age: 39, sex: "F", risk: "Moderate", score: 0.54, hcc: 1.12, gaps: 1, cohort: "Chronic pain · cannabis",  lastEnc: "11d", source: "Wearable", match: 0.88 },
  { name: "Luis Carrillo",     id: "pt-11187", age: 52, sex: "M", risk: "Low",      score: 0.29, hcc: 0.74, gaps: 0, cohort: "Wellness · preventive",    lastEnc: "6w",  source: "EHR",      match: 0.97 },
];

export function PatientsSurface({
  rows,
  openDrawer,
}: {
  rows?: PatientRow[];
  openDrawer: { patient: (p: PatientRow) => void };
}) {
  const patients = rows && rows.length ? rows : FALLBACK;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Clinical</div>
          <h1 className="page-title">Patients</h1>
          <p className="page-lede">
            The unified patient roster — every record resolved to a single identity, risk-scored,
            and tracked against open care gaps with full provenance on each number.
          </p>
        </div>
      </div>
      <PatientTable patients={patients} onOpen={openDrawer.patient} />
    </div>
  );
}
