import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/format";
import { PrintButton } from "./print-button";

interface PageProps {
  params: { id: string };
}

export const metadata = { title: "Chart print view" };

export default async function PatientPrintPage({ params }: PageProps) {
  const user = await requireUser();

  const [patient, recentNotes, labDocuments, medications] = await Promise.all([
    prisma.patient.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId!,
        deletedAt: null,
      },
      include: {
        chartSummary: true,
      },
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
  const printedAt = new Date().toLocaleString();

  const dob = patient.dateOfBirth ? new Date(patient.dateOfBirth) : null;
  const age = dob
    ? Math.floor(
        (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;
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
    <div className="min-h-screen bg-white print:bg-white py-8 px-6 print:p-0">
      <div className="mx-auto max-w-[850px] chart-sheet bg-white text-slate-900">
        {/* Screen-only controls */}
        <div className="print:hidden flex items-center justify-between mb-6">
          <Link href={`/clinic/patients/${params.id}`}>
            <Button variant="secondary" size="sm">
              Back to chart
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <p className="text-xs text-text-subtle">Print preview</p>
            <Link href={`/clinic/patients/${params.id}/download`}>
              <Button variant="ghost" size="sm">
                Customize export
              </Button>
            </Link>
            <PrintButton />
          </div>
        </div>

        {/* Document header */}
        <header className="border-b-2 border-slate-900 pb-4 mb-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-medium">
                {practiceName}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight mt-1">
                Patient Chart Summary
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                Prepared by {providerName} · {printedAt}
              </p>
            </div>
            <div className="text-right text-xs text-slate-600">
              <p>Confidential — Protected Health Information</p>
              <p className="mt-1">Chart ID: {patient.id.slice(0, 12).toUpperCase()}</p>
            </div>
          </div>
        </header>

        {/* Demographics */}
        <section className="mb-6">
          <SectionHeading>Demographics</SectionHeading>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Field label="Name" value={`${patient.firstName} ${patient.lastName}`} />
            <Field
              label="Date of birth"
              value={dob ? `${formatDate(dob)} (age ${age})` : "—"}
            />
            <Field label="Status" value={patient.status} />
            <Field
              label="Qualification"
              value={patient.qualificationStatus ?? "unknown"}
            />
            <Field label="Email" value={patient.email ?? "—"} />
            <Field label="Phone" value={patient.phone ?? "—"} />
            <Field label="Address" value={address || "—"} />
            <Field
              label="Chart readiness"
              value={
                patient.chartSummary?.completenessScore != null
                  ? `${patient.chartSummary.completenessScore}%`
                  : "—"
              }
            />
          </div>
        </section>

        {/* Allergies */}
        <section className="mb-6">
          <SectionHeading>Allergies</SectionHeading>
          {patient.allergies.length === 0 ? (
            <p className="text-sm text-slate-600">NKDA</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {patient.allergies.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center px-2 py-0.5 text-xs rounded border border-red-300 bg-red-50 text-red-800"
                >
                  ⚠ {a}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Problem list */}
        <section className="mb-6">
          <SectionHeading>Problem list</SectionHeading>
          {patient.presentingConcerns ? (
            <p className="text-sm text-slate-800 whitespace-pre-line">
              {patient.presentingConcerns}
            </p>
          ) : (
            <p className="text-sm text-slate-500">No presenting concerns documented.</p>
          )}
          {patient.contraindications.length > 0 && (
            <div className="mt-2">
              <p className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-1">
                Contraindications
              </p>
              <p className="text-sm">{patient.contraindications.join(", ")}</p>
            </div>
          )}
        </section>

        {/* Medications */}
        <section className="mb-6">
          <SectionHeading>Active medications</SectionHeading>
          {medications.length === 0 ? (
            <p className="text-sm text-slate-500">No active medications on file.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-1 pr-4 text-xs uppercase tracking-wider text-slate-500 font-medium">
                    Medication
                  </th>
                  <th className="text-left py-1 pr-4 text-xs uppercase tracking-wider text-slate-500 font-medium">
                    Type
                  </th>
                  <th className="text-left py-1 text-xs uppercase tracking-wider text-slate-500 font-medium">
                    Dosage
                  </th>
                </tr>
              </thead>
              <tbody>
                {medications.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-4">{m.name}</td>
                    <td className="py-1.5 pr-4 text-slate-600">{m.type}</td>
                    <td className="py-1.5 text-slate-600">{m.dosage ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Recent notes */}
        <section className="mb-6">
          <SectionHeading>Recent notes (last 3)</SectionHeading>
          {recentNotes.length === 0 ? (
            <p className="text-sm text-slate-500">No clinical notes on file.</p>
          ) : (
            <div className="space-y-4">
              {recentNotes.map((note: any) => (
                <article
                  key={note.id}
                  className="border border-slate-200 rounded p-3 break-inside-avoid"
                >
                  <div className="flex items-center justify-between mb-1 text-xs text-slate-600">
                    <span className="font-medium uppercase tracking-wider">
                      {note.encounter?.modality ?? "Office"} visit
                    </span>
                    <span>
                      {formatDate(note.encounter?.scheduledFor ?? note.createdAt)}
                    </span>
                  </div>
                  {note.encounter?.reason && (
                    <p className="text-sm text-slate-700 mb-1">
                      <span className="font-medium">Reason:</span>{" "}
                      {note.encounter.reason}
                    </p>
                  )}
                  {Array.isArray(note.blocks) && note.blocks.length > 0 ? (
                    <div className="text-sm space-y-2">
                      {(note.blocks as Array<any>).slice(0, 4).map((b, i) => (
                        <div key={i}>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                            {b.heading}
                          </p>
                          <p className="whitespace-pre-line text-slate-800">
                            {b.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Note contents pending finalization.
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Labs */}
        <section className="mb-6">
          <SectionHeading>Recent labs</SectionHeading>
          {labDocuments.length === 0 ? (
            <p className="text-sm text-slate-500">No lab documents on file.</p>
          ) : (
            <ul className="space-y-1.5">
              {labDocuments.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between text-sm border-b border-slate-100 py-1"
                >
                  <span>{doc.originalName}</span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {formatDate(doc.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-10 pt-3 border-t border-slate-300 text-[10px] text-slate-500 flex justify-between">
          <span>{practiceName} · Confidential PHI</span>
          <span>Printed {printedAt}</span>
        </footer>
      </div>

      <style>
        {`
          @media print {
            body { background: white !important; margin: 0 !important; }
            .chart-sheet { box-shadow: none !important; }
            @page { margin: 0.6in; size: letter; }
            h1 { font-size: 20pt; }
          }
        `}
      </style>
    </div>
  );
}

/* ── Small presentational helpers ────────────────────────────── */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs uppercase tracking-[0.16em] text-slate-500 font-semibold border-b border-slate-200 pb-1 mb-3">
      {children}
    </h2>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
        {label}
      </p>
      <p className="text-sm text-slate-900">{value}</p>
    </div>
  );
}

