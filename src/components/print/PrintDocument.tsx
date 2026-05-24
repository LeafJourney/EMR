// Shared "letterhead" frame for every dedicated `/print` route.
//
// ux/print-stylesheets-clinical (unticketed UX run).
//
// One container so the chart summary, Rx slip, lab printout, and SOAP note
// all look like the same hospital's paperwork — same header block (practice
// name + patient name + DOB), same signature line at the bottom, same
// document chrome. CSS lives in `src/app/globals.css` under
// `.print-document` (see the "Print document container" section).
//
// The on-screen frame fakes a letter-size sheet on a soft grey backing so
// clinicians can preview exactly what will land on paper before they hit
// Print. `@media print` strips the frame down to ink-only output.

import { Suspense } from "react";
import { AutoPrintTrigger } from "./AutoPrintTrigger";

export interface PrintDocumentChrome {
  /** Top-left eyebrow above the document title, e.g. "Patient chart". */
  eyebrow: string;
  /** Document title, e.g. "Chart summary" / "Lab result printout". */
  title: string;
  /** Practice / clinic name printed on the letterhead. */
  practiceName: string;
  /** Patient name printed beside the practice block. */
  patientName: string;
  /** Patient DOB string ("Mar 14, 1978 (47 y/o)"). null → printed as "—". */
  patientDob: string | null;
  /** Optional MRN / chart ID, printed under the patient name. */
  patientMrn?: string | null;
  /** Optional confidential / PHI banner shown on the top-right. */
  confidentialNote?: string;
  /** Provider name shown above the signature line in the footer. */
  providerName: string;
  /** Footer-right label, defaults to the printed timestamp. */
  printedAt?: string;
  /**
   * Whether to trigger `window.print()` once after mount. Pages are opened
   * from a chart's Print button via `target="_blank"`; auto-triggering keeps
   * the workflow one-click. Skipped when `autoPrint=false` (e.g. when the
   * user lands directly on a print URL for debugging).
   */
  autoPrint?: boolean;
}

export function PrintDocument({
  eyebrow,
  title,
  practiceName,
  patientName,
  patientDob,
  patientMrn,
  confidentialNote = "Confidential — Protected Health Information",
  providerName,
  printedAt,
  autoPrint = true,
  children,
}: PrintDocumentChrome & { children: React.ReactNode }) {
  const printedAtLabel = printedAt ?? new Date().toLocaleString();

  return (
    <div className="print-document-frame">
      <article className="print-document">
        {autoPrint ? (
          <Suspense fallback={null}>
            <AutoPrintTrigger />
          </Suspense>
        ) : null}

        <header className="doc-header">
          <div>
            <div className="doc-eyebrow">{eyebrow}</div>
            <h1
              style={{
                fontSize: "20pt",
                margin: "4px 0 6px",
                letterSpacing: "-0.01em",
                fontWeight: 600,
              }}
            >
              {title}
            </h1>
            <div style={{ fontSize: "10.5pt", color: "#444" }}>
              <strong style={{ color: "#111" }}>{practiceName}</strong>
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: "10pt", color: "#444" }}>
            <div>
              <strong style={{ color: "#111" }}>{patientName}</strong>
            </div>
            <div>DOB: {patientDob ?? "—"}</div>
            {patientMrn ? (
              <div style={{ fontVariantNumeric: "tabular-nums" }}>
                MRN: {patientMrn}
              </div>
            ) : null}
            <div style={{ marginTop: 6, fontSize: "9pt" }}>
              {confidentialNote}
            </div>
          </div>
        </header>

        {children}

        <footer className="doc-footer">
          <div>
            <div className="doc-sig">Provider signature</div>
            <div style={{ marginTop: 4 }}>{providerName}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div>{practiceName}</div>
            <div>Printed {printedAtLabel}</div>
          </div>
        </footer>
      </article>
    </div>
  );
}

/**
 * Stamps a small section into the document. Wraps content with the canonical
 * "uppercase border-bottom heading + content" treatment used everywhere.
 */
export function PrintSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="doc-section">
      <h2>{heading}</h2>
      {children}
    </section>
  );
}

/** Two-column label/value field used inside `.doc-grid`. */
export function PrintField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="doc-field-label">{label}</div>
      <div className="doc-field-value">{value || "—"}</div>
    </div>
  );
}
