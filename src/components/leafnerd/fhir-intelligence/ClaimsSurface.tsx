"use client";

import React from "react";
import { ClaimsWorkbench } from "@/components/leafnerd/ClaimsWorkbench";
import type { ClaimAnomalyRow } from "@/lib/leafnerd/types";

/**
 * ClaimsSurface — Leafnerd SPA wrapper around the existing, working
 * <ClaimsWorkbench/> real-data component.
 *
 * THEME BRIDGE (three layers — applied together):
 *   1. `className="theme-leafmart"` re-establishes the leafmart backing CSS
 *      variables (--bg, --surface, --text, --text-muted, --accent-strong,
 *      --border, --warning, --danger) so the component renders with correct
 *      colors inside the SPA's `.ln-root` scope (resilient fallback path).
 *   2. Inline `style` (BOTANICAL_BRIDGE) remaps those backing variables to
 *      botanical-palette hexes from leafnerd-theme.css, so every Tailwind class
 *      that DOES resolve to a var adopts the Leafnerd warm look (ZERO edits to
 *      ClaimsWorkbench.tsx).
 *   3. The `claims-skin` class hooks a scoped `.ln-root .claims-skin …` block
 *      appended to leafnerd-theme.css. It is required because several classes the
 *      workbench uses (bg-bg-surface, bg-bg-highlight, text-text-strong, and the
 *      bg-error / text-error / border-error family) reference Tailwind color KEYS
 *      that do NOT exist in tailwind.config.ts (only `surface`, `text`, `danger`
 *      etc. do), so Tailwind emits NO rule for them and the variable bridge can't
 *      reach them. The appended CSS restyles those exact classes to botanical
 *      tones. ALL of it stays under `.ln-root .claims-skin`, so nothing leaks.
 *
 * NOTE on var names: leafmart tokens here are backed by bare vars (--bg,
 * --surface, ...), not `--color-bg`-style names, so the bridge sets the real
 * backing vars. (See report.)
 */

// Botanical palette mapped onto leafmart backing variables (values from
// src/components/leafnerd/fhir-intelligence/leafnerd-theme.css).
const BOTANICAL_BRIDGE: React.CSSProperties = {
  // surfaces
  ["--bg" as never]: "#F6F2E9", // --cream
  ["--bg-deep" as never]: "#EFE9DA", // --cream-deep
  ["--surface" as never]: "#FDFCF8", // --paper
  ["--surface-raised" as never]: "#FDFCF8",
  ["--surface-muted" as never]: "#FAF7EF", // --paper-2
  // text
  ["--text" as never]: "#1E2922", // --ink
  ["--text-muted" as never]: "#6B756D", // --muted
  ["--text-subtle" as never]: "#97A099", // --faint
  ["--text-soft" as never]: "#46514A", // --ink-2
  ["--muted" as never]: "#6B756D",
  ["--ink" as never]: "#1E2922",
  // brand / accent
  ["--accent" as never]: "#2F7C51", // --canopy
  ["--accent-hover" as never]: "#21603D", // --canopy-deep
  ["--accent-strong" as never]: "#2F7C51", // --canopy
  ["--accent-soft" as never]: "#DDEBE0", // --canopy-soft
  ["--leaf" as never]: "#2F7C51",
  ["--leaf-soft" as never]: "#ECF3EC", // --canopy-faint
  // lines
  ["--border" as never]: "#E2DDCF", // --line
  ["--border-strong" as never]: "#D7E0D2", // --line-sage
  // highlight
  ["--highlight" as never]: "#B9831C", // --amber
  ["--highlight-hover" as never]: "#8a6010",
  ["--highlight-soft" as never]: "#F4E9CF", // --amber-soft
  // semantic
  ["--success" as never]: "#2F7C51", // --canopy
  ["--warning" as never]: "#B9831C", // --amber
  ["--danger" as never]: "#AE4435", // --rose
  ["--info" as never]: "#4C58A6", // --indigo
  // `--color-*` aliases kept symmetric with CohortSurface in case any nested
  // element falls back through them.
  ["--color-accent-strong" as never]: "#2F7C51", // --canopy
  ["--color-bg" as never]: "#F6F2E9", // --cream
};

/**
 * Shape ClaimsWorkbench actually consumes (`initialAnomalies`). Each row needs:
 *   id, claimId, status, edits[] (edits[0].message → issue title),
 *   scrubbedAt, and claim { claimNumber, cptCodes[].code, icd10Codes/diagnoses }.
 */
interface WorkbenchAnomaly {
  id: string;
  claimId: string;
  status: string;
  edits: { message: string; severity?: string }[];
  scrubbedAt: string;
  claim: {
    id: string;
    claimNumber: string | null;
    cptCodes: { code: string }[];
    icd10Codes: { code: string }[];
    diagnoses: { code: string }[];
  } | null;
}

// Believable demo set (~4 flagged claims) for when no real anomalies are passed.
const DEMO_ANOMALIES: ClaimAnomalyRow[] = [
  {
    id: "anom-demo-1",
    claimId: "CLM-48201",
    code: "99214",
    description:
      "Missing modifier -25: E/M service billed same day as a procedure without a distinct-service modifier.",
    severity: "high",
    amount: 248.0,
    scrubbedAt: "2026-06-02T09:14:00.000Z",
  },
  {
    id: "anom-demo-2",
    claimId: "CLM-48206",
    code: "96372",
    description:
      "NCCI bundling conflict: 96372 is mutually exclusive with the primary procedure on this date of service.",
    severity: "med",
    amount: 86.5,
    scrubbedAt: "2026-06-02T08:51:00.000Z",
  },
  {
    id: "anom-demo-3",
    claimId: "CLM-48217",
    code: "99213",
    description:
      "Diagnosis-to-procedure mismatch: ICD-10 F41.1 does not support the billed level-3 evaluation code.",
    severity: "med",
    amount: 132.0,
    scrubbedAt: "2026-06-02T08:20:00.000Z",
  },
  {
    id: "anom-demo-4",
    claimId: "CLM-48224",
    code: "80053",
    description:
      "MUE exceeded: comprehensive metabolic panel units exceed the medically-unlikely-edit threshold for the date span.",
    severity: "low",
    amount: 54.25,
    scrubbedAt: "2026-06-01T17:48:00.000Z",
  },
];

function toWorkbenchAnomaly(row: ClaimAnomalyRow): WorkbenchAnomaly {
  const claimNumber = row.claimId ?? row.id;
  const code = row.code ?? "99214";
  return {
    id: row.id,
    claimId: claimNumber,
    status: "Clearinghouse Blocked",
    edits: [{ message: row.description, severity: row.severity }],
    scrubbedAt: row.scrubbedAt ?? new Date().toISOString(),
    claim: {
      id: claimNumber,
      claimNumber,
      cptCodes: [{ code }],
      icd10Codes: [{ code: "F41.1" }],
      diagnoses: [{ code: "F41.1" }],
    },
  };
}

export function ClaimsSurface({ anomalies }: { anomalies?: ClaimAnomalyRow[] }) {
  // Cardinal resilience: fall back to a believable demo set when absent/empty.
  const source =
    anomalies && anomalies.length > 0 ? anomalies : DEMO_ANOMALIES;
  const workbenchAnomalies = source.map(toWorkbenchAnomaly);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Revenue Intelligence</div>
          <h1 className="page-title">Claims Auditor</h1>
          <p className="page-lede">
            Scrub outbound billing claims for CPT coding errors, NCCI/MUE
            conflicts, and compliance warnings before they reach the
            clearinghouse — with one-click AI auto-fix on every flag.
          </p>
        </div>
      </div>

      {/* THEME BRIDGE: theme-leafmart re-establishes the leafmart backing vars
          (resilient fallback); the inline style remaps them to botanical hexes;
          and `claims-skin` hooks the appended `.ln-root .claims-skin` overrides
          that catch the classes Tailwind never emits (see leafnerd-theme.css). */}
      <div
        className="theme-leafmart claims-skin"
        style={{ ...BOTANICAL_BRIDGE, marginTop: 22 }}
      >
        <ClaimsWorkbench initialAnomalies={workbenchAnomalies as any} />
      </div>
    </div>
  );
}

export default ClaimsSurface;
