// /clinic/patients/[id]/print — full chart summary, printable.
//
// ux/print-stylesheets-clinical (unticketed UX run).
//
// Rewritten on top of the shared PrintDocument frame so this lives in the
// same letterhead family as Rx slip / lab / SOAP printouts. Previous version
// rolled its own inline `@media print` block; that's now in globals.css
// under `.print-document`.

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

export const metadata = { title: "Chart summary — print" };

export default async function PatientPrintPage({ params }: PageProps) {
  const user = await requireUser();

  const [patient, recentNotes, labDocuments, medications] = await Promise.all([
    prisma.patient.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId!,
        deletedAt: null,
      },
      include: { chartSummary: true },
    }),
    prisma.note.findMany({
      where: {
        encounter: {
          patientId: params.id,
          organization: { id: user.organizationId! },
        },
      },
      include: { encounter: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.document.findMany({
      where: {
        patientId: params.id,
        kind: "lab",
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.patientMedication.findMany({
      where: { patientId: params.id, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!patient) notFound();

  const providerName = `${user.firstName} ${user.lastName}`;
  const practiceName = user.organizationName ?? "Leafjourney";

  const dob = patient.dateOfBirth ? new Date(patient.dateOfBirth) : null;
  const age = dob
    ? Math.floor(
        (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;
  const dobLabel = dob ? `${formatDate(dob)}${age !== null ? ` (${age} y/o)` : ""}` : null;

  const address = [
    patient.addressLine1,
    patient.addressLine2,
    patient.city,
    patient.state,
    patient.postalCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <PrintDocument
      eyebrow="Patient chart"
      title="Chart summary"
      practiceName={practiceName}
      patientName={`${patient.firstName} ${patient.lastName}`}
      patientDob={dobLabel}
      patientMrn={patient.id.slice(0, 12).toUpperCase()}
      providerName={providerName}
    >
      <PrintSection heading="Demographics">
        <div className="doc-grid">
          <PrintField label="Status" value={patient.status} />
          <PrintField
            label="Qualification"
            value={patient.qualificationStatus ?? "unknown"}
          />
          <PrintField label="Email" value={patient.email ?? "—"} />
          <PrintField label="Phone" value={patient.phone ?? "—"} />
          <PrintField label="Address" value={address || "—"} />
          <PrintField
            label="Chart readiness"
            value={
              patient.chartSummary?.completenessScore != null
                ? `${patient.chartSummary.completenessScore}%`
                : "—"
            }
          />
        </div>
      </PrintSection>

      <PrintSection heading="Allergies">
        {patient.allergies.length === 0 ? (
          <p style={{ margin: 0 }}>NKDA</p>
        ) : (
          <p style={{ margin: 0 }} className="doc-callout">
            {patient.allergies.join(" · ")}
          </p>
        )}
      </PrintSection>

      <PrintSection heading="Problem list">
        {patient.presentingConcerns ? (
          <p style={{ margin: 0, whiteSpace: "pre-line" }}>
            {patient.presentingConcerns}
          </p>
        ) : (
          <p style={{ margin: 0, color: "#6e6e73" }}>
            No presenting concerns documented.
          </p>
        )}
        {patient.contraindications.length > 0 && (
          <p style={{ marginTop: 8, marginBottom: 0 }}>
            <strong>Contraindications: </strong>
            {patient.contraindications.join(", ")}
          </p>
        )}
      </PrintSection>

      <PrintSection heading="Active medications">
        {medications.length === 0 ? (
          <p style={{ margin: 0, color: "#6e6e73" }}>
            No active medications on file.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Medication</th>
                <th>Type</th>
                <th>Dosage</th>
              </tr>
            </thead>
            <tbody>
              {medications.map((m) => (
                <tr key={m.id} className="break-avoid">
                  <td>{m.name}</td>
                  <td>{m.type}</td>
                  <td>{m.dosage ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PrintSection>

      <PrintSection heading="Recent notes (last 3)">
        {recentNotes.length === 0 ? (
          <p style={{ margin: 0, color: "#6e6e73" }}>
            No clinical notes on file.
          </p>
        ) : (
          <div>
            {recentNotes.map((note: any) => (
              <article
                key={note.id}
                className="print-card"
                style={{
                  border: "1px solid #d2d2d7",
                  padding: "10px 12px",
                  marginBottom: 10,
                  borderRadius: 4,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "9.5pt",
                    color: "#444",
                    marginBottom: 4,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  <span>{note.encounter?.modality ?? "Office"} visit</span>
                  <span>
                    {formatDate(note.encounter?.scheduledFor ?? note.createdAt)}
                  </span>
                </div>
                {note.encounter?.reason && (
                  <p style={{ margin: "0 0 4px" }}>
                    <strong>Reason:</strong> {note.encounter.reason}
                  </p>
                )}
                {Array.isArray(note.blocks) && note.blocks.length > 0 ? (
                  <div>
                    {(note.blocks as Array<any>).slice(0, 4).map((b, i) => (
                      <div key={i} style={{ marginTop: 6 }}>
                        <div
                          style={{
                            fontSize: "9pt",
                            color: "#444",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            fontWeight: 600,
                          }}
                        >
                          {b.heading}
                        </div>
                        <p style={{ margin: 0, whiteSpace: "pre-line" }}>
                          {b.body}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: "#6e6e73" }}>
                    Note contents pending finalization.
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </PrintSection>

      <PrintSection heading="Recent labs">
        {labDocuments.length === 0 ? (
          <p style={{ margin: 0, color: "#6e6e73" }}>
            No lab documents on file.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th style={{ width: "30%" }}>Received</th>
              </tr>
            </thead>
            <tbody>
              {labDocuments.map((doc) => (
                <tr key={doc.id} className="break-avoid">
                  <td>{doc.originalName}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatDate(doc.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PrintSection>
    </PrintDocument>
  );
}
