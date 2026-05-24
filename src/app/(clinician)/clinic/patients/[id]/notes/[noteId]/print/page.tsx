// /clinic/patients/[id]/notes/[noteId]/print — SOAP / APSO note printout.
//
// ux/print-stylesheets-clinical (unticketed UX run).
//
// The encounter-level print view. Codebase routes notes under
// `/clinic/patients/[id]/notes/[noteId]`, so the print sibling lives next
// to the editor instead of under a synthetic `/encounters/[id]/print`.
//
// Renders the note's block array (Subjective, Objective, Assessment, Plan
// in the canonical order, or whatever custom blocks the scribe agent left).
// The internal `_guardrails` block is stripped — same filter as the editor
// page — so we never leak hallucination metadata onto paper.

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
  params: { id: string; noteId: string };
}

export const metadata = { title: "Encounter note — print" };

const NOTE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  needs_review: "Needs review",
  pending_cosign: "Pending co-signature",
  finalized: "Finalized",
  amended: "Amended",
};

export default async function NotePrintPage({ params }: PageProps) {
  const user = await requireUser();

  const note = await prisma.note.findUnique({
    where: { id: params.noteId },
    include: {
      encounter: {
        select: {
          id: true,
          scheduledFor: true,
          startedAt: true,
          completedAt: true,
          modality: true,
          reason: true,
          patientId: true,
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              organizationId: true,
            },
          },
          provider: {
            select: {
              title: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
      codingSuggestion: true,
    },
  });

  if (!note) notFound();
  if (note.encounter.patient.organizationId !== user.organizationId) notFound();
  if (note.encounter.patientId !== params.id) notFound();

  const patient = note.encounter.patient;
  const practiceName = user.organizationName ?? "Leafjourney";

  // Provider on the encounter takes precedence over the printing user — the
  // printed note represents the visit's rendering provider, not whoever
  // happens to be at the printer.
  const providerName = note.encounter.provider?.user
    ? `${note.encounter.provider.user.firstName} ${note.encounter.provider.user.lastName}${
        note.encounter.provider.title
          ? `, ${note.encounter.provider.title}`
          : ""
      }`
    : `${user.firstName} ${user.lastName}`;

  const dob = patient.dateOfBirth ? new Date(patient.dateOfBirth) : null;
  const age = dob
    ? Math.floor(
        (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;
  const dobLabel = dob
    ? `${formatDate(dob)}${age !== null ? ` (${age} y/o)` : ""}`
    : null;

  const rawBlocks: unknown[] = Array.isArray(note.blocks) ? note.blocks : [];
  const blocks = rawBlocks.filter(
    (b): b is { heading: string; body: string } =>
      !!b &&
      typeof b === "object" &&
      typeof (b as { heading?: unknown }).heading === "string" &&
      (b as { heading: string }).heading !== "_guardrails",
  );

  const icd10 =
    note.codingSuggestion?.icd10 &&
    Array.isArray(note.codingSuggestion.icd10)
      ? (note.codingSuggestion.icd10 as Array<{
          code: string;
          label: string;
          confidence: number;
        }>)
      : [];

  const visitDate = note.encounter.startedAt ?? note.encounter.scheduledFor ?? note.createdAt;

  return (
    <PrintDocument
      eyebrow="Encounter note"
      title={
        note.encounter.reason
          ? `Visit · ${note.encounter.reason}`
          : `${note.encounter.modality} visit`
      }
      practiceName={practiceName}
      patientName={`${patient.firstName} ${patient.lastName}`}
      patientDob={dobLabel}
      patientMrn={patient.id.slice(0, 12).toUpperCase()}
      providerName={providerName}
    >
      <PrintSection heading="Visit metadata">
        <div className="doc-grid">
          <PrintField label="Date of service" value={formatDate(visitDate)} />
          <PrintField label="Modality" value={note.encounter.modality} />
          <PrintField
            label="Note status"
            value={NOTE_STATUS_LABEL[note.status] ?? note.status}
          />
          <PrintField
            label="Finalized"
            value={
              note.finalizedAt ? formatDate(note.finalizedAt) : "Not finalized"
            }
          />
          <PrintField
            label="Reason for visit"
            value={note.encounter.reason ?? "—"}
          />
          <PrintField
            label="AI-assisted draft"
            value={note.aiDrafted ? "Yes — reviewed by clinician" : "No"}
          />
        </div>
      </PrintSection>

      {blocks.length === 0 ? (
        <PrintSection heading="Note">
          <p style={{ margin: 0, color: "#6e6e73" }}>
            No note content recorded.
          </p>
        </PrintSection>
      ) : (
        blocks.map((b, i) => (
          <PrintSection key={`${b.heading}-${i}`} heading={b.heading}>
            <p
              style={{
                margin: 0,
                whiteSpace: "pre-line",
                fontSize: "11pt",
                lineHeight: 1.55,
              }}
            >
              {b.body || "—"}
            </p>
          </PrintSection>
        ))
      )}

      {icd10.length > 0 && (
        <PrintSection heading="Diagnosis codes (ICD-10)">
          <table>
            <thead>
              <tr>
                <th style={{ width: "20%" }}>Code</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {icd10.map((d) => (
                <tr key={d.code} className="break-avoid">
                  <td
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                    }}
                  >
                    {d.code}
                  </td>
                  <td>{d.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrintSection>
      )}

      {note.codingSuggestion?.emLevel && (
        <PrintSection heading="E/M level">
          <p style={{ margin: 0 }}>{note.codingSuggestion.emLevel}</p>
        </PrintSection>
      )}
    </PrintDocument>
  );
}
