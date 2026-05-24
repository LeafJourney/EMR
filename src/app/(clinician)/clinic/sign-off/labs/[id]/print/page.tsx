// /clinic/sign-off/labs/[id]/print — single-lab printout.
//
// ux/print-stylesheets-clinical (unticketed UX run).
//
// Renders one LabResult as a clinical document: header (practice + patient
// + DOB), panel name, markers table with abnormal-value flags, signature
// block. The on-screen LabsReviewView (sign-off queue) gets a "Print" link
// per row that opens this route in a new tab; PrintDocument auto-fires
// window.print() once the layout settles.
//
// Why under `/clinic/sign-off/labs/[id]/print` and not `/clinic/labs/[id]/print`:
// The codebase doesn't have a top-level `/clinic/labs/[id]` detail page —
// labs are reviewed from the sign-off queue overlay. Hosting the print
// route under sign-off keeps the URL path consistent with the review flow
// and matches where the source data already lives.

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils/format";
import {
  PrintDocument,
  PrintSection,
  PrintField,
} from "@/components/print/PrintDocument";

interface PageProps {
  params: { id: string };
}

interface MarkerValue {
  value: number;
  unit: string;
  refLow?: number;
  refHigh?: number;
  abnormal: boolean;
}

export const metadata = { title: "Lab result — print" };

// Lab `results` is Json; runtime-validate per-row so we never crash on a
// legacy entry that stored a string blob instead of structured markers.
function parseMarkers(raw: unknown): Array<[string, MarkerValue]> {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, v]) => !!v && typeof v === "object")
    .map(([k, v]) => {
      const obj = v as Record<string, unknown>;
      return [
        k,
        {
          value: typeof obj.value === "number" ? obj.value : Number(obj.value ?? 0),
          unit: typeof obj.unit === "string" ? obj.unit : "",
          refLow: typeof obj.refLow === "number" ? obj.refLow : undefined,
          refHigh: typeof obj.refHigh === "number" ? obj.refHigh : undefined,
          abnormal: !!obj.abnormal,
        },
      ];
    });
}

function rangeLabel(m: MarkerValue): string {
  if (m.refLow == null && m.refHigh == null) return "—";
  if (m.refLow == null) return `≤ ${m.refHigh}`;
  if (m.refHigh == null) return `≥ ${m.refLow}`;
  return `${m.refLow}–${m.refHigh}`;
}

export default async function LabPrintPage({ params }: PageProps) {
  const user = await requireUser();

  const lab = await prisma.labResult.findFirst({
    where: {
      id: params.id,
      organizationId: user.organizationId!,
    },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
        },
      },
      signedBy: { select: { firstName: true, lastName: true } },
    },
  });

  if (!lab) notFound();

  const providerName =
    lab.signedBy != null
      ? `${lab.signedBy.firstName} ${lab.signedBy.lastName}`
      : `${user.firstName} ${user.lastName}`;
  const practiceName = user.organizationName ?? "Leafjourney";

  const dob = lab.patient.dateOfBirth ? new Date(lab.patient.dateOfBirth) : null;
  const age = dob
    ? Math.floor(
        (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;
  const dobLabel = dob
    ? `${formatDate(dob)}${age !== null ? ` (${age} y/o)` : ""}`
    : null;

  const markers = parseMarkers(lab.results);

  return (
    <PrintDocument
      eyebrow="Laboratory report"
      title={lab.panelName}
      practiceName={practiceName}
      patientName={`${lab.patient.firstName} ${lab.patient.lastName}`}
      patientDob={dobLabel}
      patientMrn={lab.patient.id.slice(0, 12).toUpperCase()}
      providerName={providerName}
    >
      <PrintSection heading="Specimen">
        <div className="doc-grid">
          <PrintField label="Panel" value={lab.panelName} />
          <PrintField label="Received" value={formatDate(lab.receivedAt)} />
          <PrintField
            label="Status"
            value={lab.signedAt ? `Signed ${formatDate(lab.signedAt)}` : "Unsigned"}
          />
          <PrintField
            label="Abnormal flag"
            value={lab.abnormalFlag ? "Yes" : "No"}
          />
        </div>
      </PrintSection>

      {lab.abnormalFlag && (
        <PrintSection heading="Abnormal value summary">
          <p className="doc-callout" style={{ margin: 0 }}>
            One or more markers below fall outside reference range. Review
            flagged rows and follow up per clinical judgment.
          </p>
        </PrintSection>
      )}

      <PrintSection heading="Results">
        {markers.length === 0 ? (
          <p style={{ margin: 0, color: "#6e6e73" }}>
            No structured marker data parsed from this result. Review the
            source document attachment for raw values.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Marker</th>
                <th style={{ textAlign: "right" }}>Value</th>
                <th>Unit</th>
                <th>Reference</th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              {markers.map(([name, m]) => (
                <tr key={name} className="break-avoid">
                  <td>
                    <strong>{name}</strong>
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: m.abnormal ? 600 : 400,
                    }}
                  >
                    {m.value}
                  </td>
                  <td>{m.unit}</td>
                  <td>{rangeLabel(m)}</td>
                  <td>
                    {m.abnormal ? (
                      <span
                        style={{
                          color: "#b3261e",
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                        }}
                      >
                        ABNORMAL
                      </span>
                    ) : (
                      <span style={{ color: "#444" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PrintSection>

      {lab.reviewOutcome && (
        <PrintSection heading="Review outcome">
          <p style={{ margin: 0 }}>{lab.reviewOutcome}</p>
        </PrintSection>
      )}
    </PrintDocument>
  );
}
