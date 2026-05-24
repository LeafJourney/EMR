import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/format";
import { NoteEditor } from "./note-editor";
import { NoteCommentsPanel } from "@/components/collaboration/note-comments-panel";

interface PageProps {
  params: { id: string; noteId: string };
}

export default async function NoteDetailPage({ params }: PageProps) {
  const user = await requireUser();

  const note = await prisma.note.findUnique({
    where: { id: params.noteId },
    include: {
      encounter: {
        select: {
          id: true,
          patientId: true,
          modality: true,
          briefingContext: true,
          patient: {
            select: { id: true, firstName: true, lastName: true, organizationId: true },
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

  // Parse blocks — they are stored as JSON. Strip the internal `_guardrails`
  // metadata block planted by the scribe agent: it carries hallucination /
  // redaction metadata for the finalize-time snapshot, not display content,
  // and rendering it as a regular block exposes internals to the clinician.
  const rawBlocks: unknown[] = Array.isArray(note.blocks) ? note.blocks : [];
  const blocks = rawBlocks.filter(
    (b): b is { heading: string; body: string } =>
      !!b &&
      typeof b === "object" &&
      typeof (b as { heading?: unknown }).heading === "string" &&
      (b as { heading: string }).heading !== "_guardrails",
  );

  // Parse coding suggestion. `icd10` is a JSON column — runtime-validate
  // that it's actually an array before handing it to the client, otherwise
  // a legacy/malformed row will crash the editor on render.
  const codingSuggestion = note.codingSuggestion
    ? {
        icd10: Array.isArray(note.codingSuggestion.icd10)
          ? (note.codingSuggestion.icd10 as { code: string; label: string; confidence: number }[])
          : [],
        emLevel: note.codingSuggestion.emLevel,
        rationale: note.codingSuggestion.rationale,
      }
    : null;

  return (
    <PageShell maxWidth="max-w-[900px]">
      <PageHeader
        eyebrow="Clinical note"
        title={`Note — ${formatDate(note.createdAt)}`}
        description={`${patient.firstName} ${patient.lastName} · ${note.encounter.modality} visit`}
        actions={
          <div className="flex items-center gap-2">
            {/* ux/print-stylesheets-clinical — single-note SOAP printout */}
            <Link
              href={`/clinic/patients/${params.id}/notes/${params.noteId}/print`}
              target="_blank"
              rel="noopener"
            >
              <Button variant="ghost">Print note</Button>
            </Link>
            <Link href={`/clinic/patients/${params.id}?tab=notes`}>
              <Button variant="secondary">Back to chart</Button>
            </Link>
          </div>
        }
      />

      <NoteEditor
        noteId={note.id}
        patientId={params.id}
        encounterId={note.encounterId}
        initialBlocks={blocks}
        status={note.status}
        aiDrafted={note.aiDrafted}
        aiConfidence={note.aiConfidence}
        codingSuggestion={codingSuggestion}
        initialDemeanor={
          note.encounter.briefingContext &&
          typeof note.encounter.briefingContext === "object" &&
          "patientDemeanor" in (note.encounter.briefingContext as Record<string, unknown>)
            ? ((note.encounter.briefingContext as Record<string, unknown>).patientDemeanor as any)
            : null
        }
      />

      {/* ux/comments-mentions-collab — inline collaboration on chart notes */}
      <div className="mt-8">
        <NoteCommentsPanel noteId={note.id} patientId={params.id} />
      </div>
    </PageShell>
  );
}
