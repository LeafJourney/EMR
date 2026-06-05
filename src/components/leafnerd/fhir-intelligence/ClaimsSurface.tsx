"use client";

import React, { useState } from "react";
import type { ClaimAnomalyRow, Severity } from "@/lib/leafnerd/types";

/**
 * ClaimsSurface — Leafnerd "Claims Auditor".
 *
 * A self-contained, native botanical-themed surface (renders inside `.ln-root`,
 * so it reads the leafnerd design tokens directly — no theme bridge needed).
 *
 * Each flagged claim is an expandable card:
 *   1. Smooth CSS expansion (grid-template-rows 0fr→1fr + fade) reveals a detailed
 *      mismatch warning, recommended fix, and the CPT-vs-ICD-10 code breakdown.
 *   2. The warning is classified from the flag text + code (modifier -25, NCCI
 *      bundling, MUE, diagnosis-to-procedure mismatch) and rendered tone-coded
 *      (rose = hard denial, amber = review) with rule-specific, plain-language
 *      detail and a concrete remediation step.
 *   3. A per-claim "Re-audit" action re-runs the scrub with loading → verified
 *      states and stamps a "last re-audited" time; "Apply suggested fix" resolves
 *      the flag with its own loading state and animates the card out.
 *
 * Pure, exported helpers (classifyMismatch / formatMoney / extractIcd10 /
 * summarize / cptLabel) carry the logic and are unit-tested in
 * ClaimsSurface.test.ts.
 */

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests — no React/DOM dependency).
// ---------------------------------------------------------------------------

export type MismatchKind =
  | "modifier-25"
  | "ncci"
  | "mue"
  | "dx-mismatch"
  | "coding";

export interface MismatchClassification {
  kind: MismatchKind;
  /** Short tag shown on the card head, e.g. "Modifier -25". */
  badge: string;
  /** Governing rule, e.g. "NCCI Procedure-to-Procedure (PTP) edit". */
  rule: string;
  /** One-line warning headline (the card title). */
  headline: string;
  /** Detailed, plain-language explanation of the edit. */
  detail: string;
  /** Concrete remediation step. */
  recommendation: string;
  /** rose = hard denial / high severity; amber = review. */
  tone: "rose" | "amber";
}

const CPT_LABELS: Record<string, string> = {
  "99213": "Level 3 office / outpatient visit",
  "99214": "Level 4 office / outpatient visit",
  "99215": "Level 5 office / outpatient visit",
  "96372": "Therapeutic / diagnostic injection",
  "80053": "Comprehensive metabolic panel",
};

const ICD_LABELS: Record<string, string> = {
  "F41.1": "Generalized anxiety disorder",
  "E11.9": "Type 2 diabetes mellitus",
  "M54.5": "Low back pain",
  "I10": "Essential hypertension",
  "G47.00": "Insomnia, unspecified",
};

/** Friendly label for a CPT/procedure code (falls back to a generic label). */
export function cptLabel(code?: string | null): string {
  return (code && CPT_LABELS[code]) || "Procedure code";
}

/** Friendly label for an ICD-10/diagnosis code (falls back to a generic label). */
export function icdLabel(code?: string | null): string {
  return (code && ICD_LABELS[code]) || "Linked diagnosis";
}

// ICD-10-CM pattern: a letter (excluding U) + two digits + optional decimal tail.
const ICD10_RE = /\b([A-TV-Z]\d{2}(?:\.\d{1,4})?)\b/;

/** Pull the first ICD-10-looking token out of free text (null when absent). */
export function extractIcd10(text: string): string | null {
  const m = text.match(ICD10_RE);
  return m ? m[1] : null;
}

/** Currency string for an optional dollar amount ("—" when absent/NaN). */
export function formatMoney(amount?: number): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Aggregate counts for the summary strip. */
export function summarize(rows: ClaimAnomalyRow[]): {
  flagged: number;
  atRisk: number;
} {
  return {
    flagged: rows.length,
    atRisk: rows.reduce((sum, r) => sum + (r.amount ?? 0), 0),
  };
}

/**
 * Classify a flagged claim into a specific, well-documented coding edit and
 * produce the detailed warning copy the expanded card renders. Detection is
 * keyword-driven over the scrubber's description plus the billed code.
 */
export function classifyMismatch(row: ClaimAnomalyRow): MismatchClassification {
  const text = (row.description || "").toLowerCase();
  const code = row.code ?? "the E/M service";
  const dx = extractIcd10(row.description) ?? "the linked diagnosis";
  // rose for hard denials / high severity, amber otherwise.
  const tone: "rose" | "amber" = row.severity === "high" ? "rose" : "amber";

  if (
    text.includes("modifier -25") ||
    text.includes("modifier-25") ||
    text.includes("distinct-service") ||
    text.includes("distinct service")
  ) {
    return {
      kind: "modifier-25",
      badge: "Modifier -25",
      rule: "CPT Modifier -25 — significant, separately identifiable E/M",
      headline:
        "E/M billed with a same-day procedure but no distinct-service modifier",
      detail:
        `An evaluation & management service (${code}) is reported on the same ` +
        `date as a minor procedure. Payer edits require modifier -25 to attest ` +
        `the E/M was significant and separately identifiable from the procedure. ` +
        `Without it, the E/M line bundles into the procedure and is denied.`,
      recommendation:
        "Append modifier -25 to the E/M line if the documentation supports a " +
        "distinct service; otherwise drop the separate E/M charge.",
      tone,
    };
  }

  if (
    text.includes("ncci") ||
    text.includes("bundling") ||
    text.includes("mutually exclusive") ||
    text.includes("component")
  ) {
    return {
      kind: "ncci",
      badge: "NCCI bundling",
      rule: "NCCI Procedure-to-Procedure (PTP) edit",
      headline: "Procedure pair is mutually exclusive on the same date of service",
      detail:
        `The National Correct Coding Initiative flags ${code} as a component of ` +
        `(or mutually exclusive with) the primary procedure on this claim. ` +
        `Billing both without an appropriate modifier (e.g. -59 / -XU) triggers ` +
        `an automatic component-code denial.`,
      recommendation:
        "Confirm the services were genuinely distinct; if so, append the correct " +
        "NCCI-associated modifier. If not, remove the bundled component code.",
      tone,
    };
  }

  if (
    text.includes("mue") ||
    text.includes("medically-unlikely") ||
    text.includes("medically unlikely") ||
    text.includes("units exceed")
  ) {
    return {
      kind: "mue",
      badge: "MUE exceeded",
      rule: "CMS Medically Unlikely Edit (MUE)",
      headline: "Reported units exceed the medically-unlikely threshold",
      detail:
        `The units billed for ${code} exceed the CMS MUE maximum for a single ` +
        `date of service. Lines above the MUE limit are denied as a unit-of-` +
        `service edit and cannot be appealed as one line.`,
      recommendation:
        "Confirm the units are accurate. If clinically justified across separate " +
        "encounters, split onto distinct date-of-service lines with documentation.",
      tone,
    };
  }

  if (
    text.includes("mismatch") ||
    text.includes("does not support") ||
    text.includes("diagnosis-to-procedure") ||
    text.includes("medical necessity")
  ) {
    return {
      kind: "dx-mismatch",
      badge: "Dx ↔ CPT mismatch",
      rule: "Medical-necessity / LCD diagnosis edit",
      headline: "Diagnosis does not support the billed procedure level",
      detail:
        `The linked ICD-10 diagnosis (${dx}) does not establish medical necessity ` +
        `for ${code} under the payer's coverage policy. Procedure-to-diagnosis ` +
        `mismatches are denied for lack of medical necessity.`,
      recommendation:
        "Re-link the procedure to a supporting diagnosis from the encounter, or " +
        "down-code the procedure to the level the documentation supports.",
      tone,
    };
  }

  return {
    kind: "coding",
    badge: "Coding edit",
    rule: "Claim scrubber rule violation",
    headline: "Claim failed an automated coding edit",
    detail:
      row.description ||
      "An automated payer edit flagged this claim before clearinghouse submission.",
    recommendation:
      "Review the flagged line against payer policy and correct before resubmission.",
    tone,
  };
}

/** Short human label for a severity value. */
function sevLabel(sev?: Severity): string {
  if (sev === "high") return "High risk";
  if (sev === "med") return "Medium";
  if (sev === "low") return "Low";
  return "Review";
}

/** Readable wall-clock time for a "last re-audited" stamp. */
function formatAuditedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "just now";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function cls(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Demo data — believable flagged claims for when no real anomalies are passed.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Scoped styles — every selector lives under `.ln-claims-auditor` so nothing
// leaks into the wider EMR. Reads botanical tokens declared on `.ln-root`.
// ---------------------------------------------------------------------------

const AUDITOR_CSS = `
.ln-claims-auditor { --rose: #AE4435; --rose-soft: #F2DBD4; --amber: #B9831C; --amber-soft: #F4E9CF; }

.ln-claims-auditor .lca-summary {
  display: flex; align-items: center; gap: 28px;
  padding: 16px 20px; margin-bottom: 18px;
  background: var(--paper); border: 1px solid var(--line);
  border-radius: var(--r-md); box-shadow: var(--sh-1);
}
.ln-claims-auditor .lca-summary-stat { display: flex; flex-direction: column; gap: 2px; }
.ln-claims-auditor .lca-summary-num { font-size: 22px; font-weight: 800; color: var(--ink); letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.ln-claims-auditor .lca-summary-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.ln-claims-auditor .lca-summary-pulse {
  margin-left: auto; display: inline-flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 600; color: var(--canopy-deep);
  background: var(--canopy-faint); border: 1px solid var(--line-sage);
  padding: 6px 12px; border-radius: 999px;
}
.ln-claims-auditor .lca-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--canopy); animation: lca-pulse 1.8s ease-in-out infinite; }

.ln-claims-auditor .lca-list { display: flex; flex-direction: column; gap: 12px; }

.ln-claims-auditor .lca-empty {
  padding: 56px 24px; text-align: center; color: var(--muted); font-size: 14px;
  background: var(--sage-mist); border: 1px solid var(--line-sage); border-radius: var(--r-lg);
}
.ln-claims-auditor .lca-empty strong { color: var(--ink); }

/* --- Card --- */
.ln-claims-auditor .lca-card {
  background: var(--paper); border: 1px solid var(--line);
  border-radius: var(--r-md); box-shadow: var(--sh-1);
  overflow: hidden; max-height: 1400px;
  animation: lca-in 380ms cubic-bezier(.4,0,.2,1) both;
  transition: box-shadow 220ms ease, border-color 220ms ease, transform 220ms ease,
    max-height 440ms cubic-bezier(.4,0,.2,1), opacity 320ms ease,
    margin 440ms ease, padding 440ms ease;
}
.ln-claims-auditor .lca-card:hover { box-shadow: var(--sh-2); border-color: var(--line-sage); }
.ln-claims-auditor .lca-card.is-open { box-shadow: var(--sh-2); border-color: var(--canopy-soft); }
.ln-claims-auditor .lca-card.tone-rose { border-left: 3px solid var(--rose); }
.ln-claims-auditor .lca-card.tone-amber { border-left: 3px solid var(--amber); }
.ln-claims-auditor .lca-card.is-resolving {
  max-height: 0 !important; opacity: 0; margin-top: 0; margin-bottom: -12px;
  padding-top: 0; padding-bottom: 0; pointer-events: none;
}

/* --- Card head (the clickable expander) --- */
.ln-claims-auditor .lca-card-head {
  width: 100%; display: flex; align-items: center; gap: 16px;
  padding: 14px 18px; background: none; border: 0; cursor: pointer; text-align: left;
  font: inherit; color: inherit;
}
.ln-claims-auditor .lca-card-head:focus-visible { outline: 2px solid var(--canopy); outline-offset: -2px; border-radius: var(--r-md); }

.ln-claims-auditor .lca-code {
  flex: none; width: 56px; height: 44px; border-radius: var(--r-sm);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--mono); font-weight: 700; font-size: 14px; letter-spacing: -0.02em;
}
.ln-claims-auditor .lca-code.tone-rose { background: var(--rose-soft); color: var(--rose); border: 1px solid #E6C3BB; }
.ln-claims-auditor .lca-code.tone-amber { background: var(--amber-soft); color: #8a6010; border: 1px solid #E8D6AE; }

.ln-claims-auditor .lca-head-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ln-claims-auditor .lca-title {
  font-size: 14px; font-weight: 700; color: var(--ink); line-height: 1.3;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ln-claims-auditor .lca-card.is-open .lca-title { white-space: normal; }
.ln-claims-auditor .lca-meta { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ln-claims-auditor .lca-badge {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  color: var(--ink-2); background: var(--cream-deep); border: 1px solid var(--line);
  padding: 1px 7px; border-radius: 999px;
}
.ln-claims-auditor .lca-verified { color: var(--canopy-deep); font-weight: 700; }

.ln-claims-auditor .lca-head-right { flex: none; display: flex; align-items: center; gap: 14px; }
.ln-claims-auditor .lca-sev {
  font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em;
  padding: 3px 9px; border-radius: 999px;
}
.ln-claims-auditor .lca-sev.tone-rose { background: var(--rose-soft); color: var(--rose); }
.ln-claims-auditor .lca-sev.tone-amber { background: var(--amber-soft); color: #8a6010; }
.ln-claims-auditor .lca-amount { font-size: 14px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; min-width: 70px; text-align: right; }
.ln-claims-auditor .lca-chevron { color: var(--faint); font-size: 16px; line-height: 1; transition: transform 320ms cubic-bezier(.4,0,.2,1); }
.ln-claims-auditor .lca-card.is-open .lca-chevron { transform: rotate(180deg); color: var(--canopy); }

/* --- Smooth expansion: grid-rows 0fr -> 1fr animates to content height --- */
.ln-claims-auditor .lca-body {
  display: grid; grid-template-rows: 0fr;
  transition: grid-template-rows 380ms cubic-bezier(.4,0,.2,1);
}
.ln-claims-auditor .lca-card.is-open .lca-body { grid-template-rows: 1fr; }
.ln-claims-auditor .lca-body-inner {
  overflow: hidden; min-height: 0;
  opacity: 0; transform: translateY(-6px);
  transition: opacity 300ms ease 60ms, transform 300ms ease 60ms;
}
.ln-claims-auditor .lca-card.is-open .lca-body-inner { opacity: 1; transform: none; }
.ln-claims-auditor .lca-body-pad { padding: 4px 18px 18px; display: flex; flex-direction: column; gap: 14px; }

/* --- Mismatch warning box --- */
.ln-claims-auditor .lca-warning { border-radius: var(--r-sm); padding: 14px 16px; border: 1px solid; }
.ln-claims-auditor .lca-warning.tone-rose { background: var(--rose-soft); border-color: #E6C3BB; }
.ln-claims-auditor .lca-warning.tone-amber { background: var(--amber-soft); border-color: #E8D6AE; }
.ln-claims-auditor .lca-warning-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.ln-claims-auditor .lca-warning-icon { font-size: 15px; line-height: 1; }
.ln-claims-auditor .lca-warning-rule { font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
.ln-claims-auditor .lca-warning.tone-rose .lca-warning-rule { color: var(--rose); }
.ln-claims-auditor .lca-warning.tone-amber .lca-warning-rule { color: #8a6010; }
.ln-claims-auditor .lca-warning-detail { font-size: 13px; line-height: 1.55; color: var(--ink-2); margin: 0; }
.ln-claims-auditor .lca-reco { margin-top: 10px; display: flex; gap: 10px; align-items: baseline; font-size: 12.5px; color: var(--ink); line-height: 1.5; }
.ln-claims-auditor .lca-reco-tag {
  flex: none; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em;
  color: var(--canopy-deep); background: var(--paper); border: 1px solid var(--line-sage);
  padding: 2px 7px; border-radius: 999px;
}

/* --- CPT vs ICD code breakdown --- */
.ln-claims-auditor .lca-codes { display: flex; align-items: stretch; gap: 12px; }
.ln-claims-auditor .lca-code-cell {
  flex: 1; background: var(--paper-2); border: 1px solid var(--line); border-radius: var(--r-sm);
  padding: 11px 13px; display: flex; flex-direction: column; gap: 3px;
}
.ln-claims-auditor .lca-code-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
.ln-claims-auditor .lca-code-val { font-family: var(--mono); font-size: 17px; font-weight: 800; color: var(--ink); letter-spacing: -0.02em; }
.ln-claims-auditor .lca-code-sub { font-size: 11.5px; color: var(--muted); }
.ln-claims-auditor .lca-codes-vs { align-self: center; font-size: 11px; font-weight: 700; color: var(--faint); text-transform: uppercase; }

.ln-claims-auditor .lca-audit-stamp { font-size: 11.5px; color: var(--canopy-deep); display: flex; align-items: center; gap: 6px; }

/* --- Actions --- */
.ln-claims-auditor .lca-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.ln-claims-auditor .lca-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
  padding: 9px 16px; border-radius: var(--r-sm); border: 1px solid transparent;
  transition: background 180ms ease, box-shadow 180ms ease, transform 180ms ease, opacity 180ms ease, color 180ms ease, border-color 180ms ease;
}
.ln-claims-auditor .lca-btn:disabled { cursor: default; }
.ln-claims-auditor .lca-btn-primary { background: var(--canopy); color: #fff; box-shadow: var(--sh-1); }
.ln-claims-auditor .lca-btn-primary:hover:not(:disabled) { background: var(--canopy-deep); transform: translateY(-1px); box-shadow: var(--sh-2); }
.ln-claims-auditor .lca-btn-primary.is-done { background: var(--canopy-soft); color: var(--canopy-deep); box-shadow: none; }
.ln-claims-auditor .lca-btn-ghost { background: var(--paper); color: var(--ink-2); border-color: var(--line); }
.ln-claims-auditor .lca-btn-ghost:hover:not(:disabled) { border-color: var(--amber); color: #8a6010; background: var(--amber-soft); }
.ln-claims-auditor .lca-btn:disabled:not(.is-done) { opacity: .72; }

.ln-claims-auditor .lca-spinner {
  width: 14px; height: 14px; border-radius: 999px; border: 2px solid currentColor;
  border-top-color: transparent; animation: lca-spin .7s linear infinite;
}

/* --- Toast --- */
.ln-claims-auditor .lca-toast {
  position: fixed; bottom: 24px; right: 24px; z-index: 60; max-width: 360px;
  display: flex; align-items: center; gap: 10px;
  background: var(--paper); border: 1px solid var(--canopy-soft); border-radius: var(--r-md);
  box-shadow: var(--sh-pop); padding: 14px 18px; font-size: 13px; color: var(--ink); font-weight: 600;
  animation: lca-toast-in 320ms cubic-bezier(.4,0,.2,1) both;
}
.ln-claims-auditor .lca-toast-check {
  flex: none; width: 22px; height: 22px; border-radius: 999px;
  background: var(--canopy-faint); color: var(--canopy-deep);
  display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800;
}

@keyframes lca-spin { to { transform: rotate(360deg); } }
@keyframes lca-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes lca-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes lca-toast-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .ln-claims-auditor .lca-card,
  .ln-claims-auditor .lca-body,
  .ln-claims-auditor .lca-body-inner,
  .ln-claims-auditor .lca-chevron,
  .ln-claims-auditor .lca-dot,
  .ln-claims-auditor .lca-spinner,
  .ln-claims-auditor .lca-toast { animation: none !important; transition: none !important; }
}
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type AuditPhase = "idle" | "auditing" | "verified" | "fixing";

export function ClaimsSurface({ anomalies }: { anomalies?: ClaimAnomalyRow[] }) {
  // Cardinal resilience: fall back to a believable demo set when absent/empty.
  const initial =
    anomalies && anomalies.length > 0 ? anomalies : DEMO_ANOMALIES;

  const [rows, setRows] = useState<ClaimAnomalyRow[]>(initial);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Record<string, AuditPhase>>({});
  const [auditedAt, setAuditedAt] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const summary = summarize(rows);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const toggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  // Re-audit: re-run the scrub with a loading state. These are live flags, so a
  // re-audit re-confirms the issue and stamps a fresh "last re-audited" time.
  const reAudit = (id: string) => {
    setPhase((p) => ({ ...p, [id]: "auditing" }));
    setTimeout(() => {
      setPhase((p) => ({ ...p, [id]: "verified" }));
      setAuditedAt((a) => ({ ...a, [id]: new Date().toISOString() }));
      setTimeout(() => {
        setPhase((p) => ({ ...p, [id]: "idle" }));
      }, 1100);
    }, 1400);
  };

  // Apply the recommended fix: loading state, then animate the card out and
  // re-queue for the clearinghouse.
  const applyFix = (id: string) => {
    setPhase((p) => ({ ...p, [id]: "fixing" }));
    setTimeout(() => {
      setExpandedId((prev) => (prev === id ? null : prev));
      setResolvingId(id);
      setTimeout(() => {
        setRows((rs) => rs.filter((r) => r.id !== id));
        setResolvingId(null);
        setPhase((p) => {
          const next = { ...p };
          delete next[id];
          return next;
        });
        showToast("Suggested fix applied — claim re-queued for clearinghouse submission.");
      }, 440);
    }, 1300);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Revenue Intelligence</div>
          <h1 className="page-title">Claims Auditor</h1>
          <p className="page-lede">
            Scrub outbound billing claims for CPT coding errors, NCCI/MUE
            conflicts, and diagnosis-to-procedure mismatches before they reach
            the clearinghouse. Expand any flag for the full rule detail, then
            re-audit or apply the suggested fix in one click.
          </p>
        </div>
      </div>

      <div className="ln-claims-auditor" style={{ marginTop: 22 }}>
        <style dangerouslySetInnerHTML={{ __html: AUDITOR_CSS }} />

        {/* Summary strip */}
        <div className="lca-summary">
          <div className="lca-summary-stat">
            <span className="lca-summary-num">{summary.flagged}</span>
            <span className="lca-summary-label">Flagged claims</span>
          </div>
          <div className="lca-summary-stat">
            <span className="lca-summary-num">{formatMoney(summary.atRisk)}</span>
            <span className="lca-summary-label">Revenue at risk</span>
          </div>
          <div className="lca-summary-pulse">
            <span className="lca-dot" />
            Live clearinghouse scrub
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="lca-empty">
            🎉 <strong>All claims cleared.</strong> Nothing is blocked at the
            clearinghouse — excellent work.
          </div>
        ) : (
          <div className="lca-list">
            {rows.map((row, i) => {
              const m = classifyMismatch(row);
              const open = expandedId === row.id;
              const p = phase[row.id] ?? "idle";
              const dx = extractIcd10(row.description);
              const stamped = auditedAt[row.id];
              const resolving = resolvingId === row.id;

              return (
                <div
                  key={row.id}
                  className={cls(
                    "lca-card",
                    `tone-${m.tone}`,
                    open && "is-open",
                    resolving && "is-resolving"
                  )}
                  style={{ animationDelay: `${i * 55}ms` }}
                >
                  <button
                    type="button"
                    className="lca-card-head"
                    aria-expanded={open}
                    onClick={() => toggle(row.id)}
                  >
                    <span className={cls("lca-code", `tone-${m.tone}`)}>
                      {row.code ?? "—"}
                    </span>
                    <span className="lca-head-main">
                      <span className="lca-title">{m.headline}</span>
                      <span className="lca-meta">
                        Claim #{row.claimId ?? row.id}
                        <span className="lca-badge">{m.badge}</span>
                        {stamped && <span className="lca-verified">Re-verified</span>}
                      </span>
                    </span>
                    <span className="lca-head-right">
                      <span className={cls("lca-sev", `tone-${m.tone}`)}>
                        {sevLabel(row.severity)}
                      </span>
                      <span className="lca-amount">{formatMoney(row.amount)}</span>
                      <span className="lca-chevron">⌄</span>
                    </span>
                  </button>

                  <div className="lca-body">
                    <div className="lca-body-inner">
                      <div className="lca-body-pad">
                        {/* Mismatch warning */}
                        <div className={cls("lca-warning", `tone-${m.tone}`)}>
                          <div className="lca-warning-head">
                            <span className="lca-warning-icon">⚠️</span>
                            <span className="lca-warning-rule">{m.rule}</span>
                          </div>
                          <p className="lca-warning-detail">{m.detail}</p>
                          <div className="lca-reco">
                            <span className="lca-reco-tag">Recommended fix</span>
                            <span>{m.recommendation}</span>
                          </div>
                        </div>

                        {/* CPT vs ICD-10 breakdown */}
                        <div className="lca-codes">
                          <div className="lca-code-cell">
                            <span className="lca-code-label">Procedure (CPT)</span>
                            <span className="lca-code-val">{row.code ?? "—"}</span>
                            <span className="lca-code-sub">{cptLabel(row.code)}</span>
                          </div>
                          <span className="lca-codes-vs">vs</span>
                          <div className="lca-code-cell">
                            <span className="lca-code-label">Diagnosis (ICD-10)</span>
                            <span className="lca-code-val">{dx ?? "—"}</span>
                            <span className="lca-code-sub">{icdLabel(dx)}</span>
                          </div>
                        </div>

                        {stamped && (
                          <div className="lca-audit-stamp">
                            ✓ Last re-audited {formatAuditedAt(stamped)} — issue
                            persists, fix still required.
                          </div>
                        )}

                        {/* Actions */}
                        <div className="lca-actions">
                          <button
                            type="button"
                            className={cls(
                              "lca-btn",
                              "lca-btn-primary",
                              p === "verified" && "is-done"
                            )}
                            disabled={p !== "idle"}
                            onClick={() => reAudit(row.id)}
                          >
                            {p === "auditing" ? (
                              <>
                                <span className="lca-spinner" />
                                Re-auditing…
                              </>
                            ) : p === "verified" ? (
                              <>✓ Re-verified</>
                            ) : (
                              <>↻ Re-audit claim</>
                            )}
                          </button>
                          <button
                            type="button"
                            className="lca-btn lca-btn-ghost"
                            disabled={p !== "idle"}
                            onClick={() => applyFix(row.id)}
                          >
                            {p === "fixing" ? (
                              <>
                                <span className="lca-spinner" />
                                Applying fix…
                              </>
                            ) : (
                              <>⚡ Apply suggested fix</>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {toast && (
          <div className="lca-toast">
            <span className="lca-toast-check">✓</span>
            <span>{toast}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default ClaimsSurface;
