// ---------------------------------------------------------------------------
// Biomarker assembler — maps lab rows into the IR_risk BiomarkerPanel
// (Linear EMR-1128, epic EMR-1118).
//
// The Structured Biomarker Stream (spec Phase 1.2) is sourced from LabResult
// rows whose `results` JSON is keyed by marker name
// ({ markerName: { value, unit, refLow?, refHigh?, abnormal } }). Fasting
// glucose, fasting insulin, and HbA1c routinely live in DIFFERENT panels
// (CMP vs. a standalone insulin vs. an HbA1c), so the assembler scans across
// recent panels and takes the most recent value for each marker.
//
// Pure + side-effect-free: the Prisma read lives in the server action
// (ir-risk-actions.ts); this stays unit-testable with plain row objects.
// ---------------------------------------------------------------------------

import type { BiomarkerPanel } from "./types";

/** The three biomarker classes the IR_risk engine consumes. */
export type BiomarkerClass = "fastingGlucose" | "fastingInsulin" | "hba1c";

/** A single marker value inside a LabResult.results JSON blob. */
interface MarkerValue {
  value: number;
  unit?: string;
  abnormal?: boolean;
}

/** Structural subset of a LabResult row the assembler needs. */
export interface LabRowForIr {
  panelName?: string | null;
  receivedAt: string | Date;
  /** LabResult.results JSON — keyed by marker name. */
  results: unknown;
}

/** Where one assembled biomarker value came from (for UI + provenance). */
export interface BiomarkerSourceRef {
  markerName: string;
  panelName?: string | null;
  value: number;
  unit?: string;
  /** ISO timestamp of the draw (= the row's receivedAt). */
  observedAt: string;
}

export interface AssembledBiomarkers {
  panel: BiomarkerPanel;
  sources: Partial<Record<BiomarkerClass, BiomarkerSourceRef>>;
}

/**
 * Classify a lab marker name into one of the IR biomarker classes, or null.
 * Order matters: HbA1c first (so "estimated average glucose" never wins),
 * then insulin (guarding against IGF / insulin-like growth factor), then
 * plain glucose (excluding the "average glucose" eAG companion of A1c).
 */
export function classifyMarker(name: string): BiomarkerClass | null {
  const n = name.toLowerCase();
  if (n.includes("a1c")) return "hba1c";
  if (n.includes("insulin")) {
    if (n.includes("growth") || n.includes("igf")) return null; // IGF-1
    return "fastingInsulin";
  }
  if (n.includes("glucose")) {
    if (n.includes("average") || n.includes("tolerance")) return null;
    return "fastingGlucose";
  }
  return null;
}

/**
 * From a single results blob, return the marker name present for each
 * biomarker class — used by the lab overlay to decide whether a panel is
 * "metabolic" and which rows to tint.
 */
export function metabolicMarkerNames(
  results: unknown
): Partial<Record<BiomarkerClass, string>> {
  const out: Partial<Record<BiomarkerClass, string>> = {};
  if (!results || typeof results !== "object") return out;
  for (const name of Object.keys(results as Record<string, unknown>)) {
    const cls = classifyMarker(name);
    if (!cls || out[cls]) continue;
    const m = (results as Record<string, MarkerValue>)[name];
    if (m && typeof m.value === "number") out[cls] = name;
  }
  return out;
}

function toIso(d: string | Date): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function ms(d: string | Date): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

/**
 * Assemble a BiomarkerPanel from recent lab rows. Picks the most recent
 * value for each biomarker class across all panels. `drawnAt` anchors to the
 * OLDEST of the glucose/insulin pair actually used for HOMA-IR, so the engine
 * flags staleness honestly when either half of the anchor is old.
 */
export function assembleBiomarkers(rows: LabRowForIr[]): AssembledBiomarkers {
  const byRecent = [...rows].sort((a, b) => ms(b.receivedAt) - ms(a.receivedAt));
  const sources: Partial<Record<BiomarkerClass, BiomarkerSourceRef>> = {};

  for (const row of byRecent) {
    if (!row.results || typeof row.results !== "object") continue;
    const blob = row.results as Record<string, MarkerValue>;
    for (const markerName of Object.keys(blob)) {
      const cls = classifyMarker(markerName);
      if (!cls || sources[cls]) continue; // first hit wins (most recent)
      const m = blob[markerName];
      if (!m || typeof m.value !== "number" || !Number.isFinite(m.value)) continue;
      sources[cls] = {
        markerName,
        panelName: row.panelName ?? undefined,
        value: m.value,
        unit: m.unit,
        observedAt: toIso(row.receivedAt),
      };
    }
  }

  const glucose = sources.fastingGlucose;
  const insulin = sources.fastingInsulin;
  const hba1c = sources.hba1c;

  // Freshness anchors to the least-fresh half of the HOMA-IR pair.
  let drawnAt: string | undefined;
  if (glucose && insulin) {
    drawnAt =
      ms(glucose.observedAt) <= ms(insulin.observedAt)
        ? glucose.observedAt
        : insulin.observedAt;
  } else {
    drawnAt = glucose?.observedAt ?? insulin?.observedAt ?? hba1c?.observedAt;
  }

  const panel: BiomarkerPanel = {
    fastingGlucoseMgDl: glucose?.value,
    fastingInsulinUIuMl: insulin?.value,
    hba1cPct: hba1c?.value,
    drawnAt,
  };

  return { panel, sources };
}
