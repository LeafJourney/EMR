import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatModality } from "@/lib/utils/format";
import { NoteEditor } from "./note-editor";
import { StaffObjectiveEditor } from "./staff-objective-editor";
import { NoteCommentsPanel } from "@/components/collaboration/note-comments-panel";
import { hasPermission, canDocumentObjective } from "@/lib/rbac/permissions";
import { coerceVitals } from "@/lib/clinical/objective-vitals";
import { buildVisitCompletionBundle } from "@/lib/domain/visit-completion";
import { VisitCompletionPanel } from "./visit-completion-panel";
import { AvsReviewPanel } from "./avs-review-panel";
import { noteStatusBadge } from "./note-status";
import { AgentJobStrip, type AgentJobLite } from "./agent-job-strip";

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
      visitCompletion: true,
    },
  });

  if (!note) notFound();
  if (note.encounter.patient.organizationId !== user.organizationId) notFound();
  if (note.encounter.patientId !== params.id) notFound();

  const patient = note.encounter.patient;
  const futureAppointment = await prisma.appointment.findFirst({
    where: {
      patientId: params.id,
      startAt: { gt: new Date() },
      status: { notIn: ["cancelled", "no_show"] },
    },
    select: { id: true },
  });

  // Parse blocks — they are stored as JSON. Strip the internal `_guardrails`
  // metadata block planted by the scribe agent: it carries hallucination /
  // redaction metadata, not display content, and rendering it as a regular
  // block exposes internals to the clinician.
  const rawBlocks: unknown[] = Array.isArray(note.blocks) ? note.blocks : [];
  const blocks = rawBlocks.filter(
    (b): b is { heading: string; body: string } =>
      !!b &&
      typeof b === "object" &&
      typeof (b as { heading?: unknown }).heading === "string" &&
      (b as { heading: string }).heading !== "_guardrails",
  );

  // EMR-131: lift the per-sentence hallucination flags out of the
  // `_guardrails` block so the editor can show them inline. These are the
  // sentences the conservative grounding scan (note-guardrails.ts) could
  // not trace to the transcript or chart context — the clinician reviews
  // and confirms or edits them before signing. The block itself stays
  // hidden; only the structured flags cross to the client.
  const guardrailsBlock = rawBlocks.find(
    (b): b is { heading: string; metadata?: { guardrails?: unknown } } =>
      !!b &&
      typeof b === "object" &&
      (b as { heading?: unknown }).heading === "_guardrails",
  );
  const rawGuardrails = guardrailsBlock?.metadata?.guardrails as
    | { flaggedSpans?: unknown; hallucinationConfidence?: unknown }
    | undefined;
  const hallucinationFlags = Array.isArray(rawGuardrails?.flaggedSpans)
    ? (rawGuardrails!.flaggedSpans as unknown[]).filter(
        (f): f is { block: string; span: string; reason: string } =>
          !!f &&
          typeof f === "object" &&
          typeof (f as { span?: unknown }).span === "string" &&
          typeof (f as { reason?: unknown }).reason === "string",
      )
    : [];
  const hallucinationConfidence =
    typeof rawGuardrails?.hallucinationConfidence === "number"
      ? rawGuardrails.hallucinationConfidence
      : null;

  // Role-aware authoring surface. Physicians/mid-levels get the full editor;
  // rooming staff (MAs) with only the scoped Objective capability get the
  // vitals/exam editor; read-only viewers see a static render; anyone with no
  // note access at all is bounced to notFound (front-office has no clinical
  // grant and should never see chart content).
  const canEditNotes = hasPermission(user, "notes.edit");
  const canDocObjective = canDocumentObjective(user);
  const canReadNotes = hasPermission(user, "notes.read");
  if (!canEditNotes && !canDocObjective && !canReadNotes) notFound();

  // Pull the Objective ("findings") block (+ any prior staff attribution) for
  // the staff editor's initial state.
  const findingsBlock = rawBlocks.find(
    (b): b is Record<string, unknown> =>
      !!b && typeof b === "object" && (b as { type?: unknown }).type === "findings",
  ) as Record<string, unknown> | undefined;
  const fMeta = (findingsBlock?.metadata ?? {}) as Record<string, unknown>;
  const initialVitals = coerceVitals(fMeta.objectiveVitals);
  const initialExam =
    typeof fMeta.objectiveExam === "string"
      ? fMeta.objectiveExam
      : typeof findingsBlock?.body === "string"
        ? (findingsBlock.body as string)
        : "";
  const initialAttribution =
    fMeta.documentedByName || fMeta.documentedAt
      ? {
          name: typeof fMeta.documentedByName === "string" ? fMeta.documentedByName : undefined,
          role: typeof fMeta.documentedByRole === "string" ? fMeta.documentedByRole : undefined,
          at: typeof fMeta.documentedAt === "string" ? fMeta.documentedAt : undefined,
        }
      : null;

  // Parse coding suggestion. `icd10` / `approvedIcd10` are JSON columns —
  // runtime-validate they're actually arrays before handing them to the
  // client, otherwise a legacy/malformed row will crash the editor on render.
  // EMR-1097: also surface the physician approval decision so the editor and
  // the Practice Readiness card render the real coding state.
  const codingRow = note.codingSuggestion;
  const codingSuggestion = codingRow
    ? {
        icd10: Array.isArray(codingRow.icd10)
          ? (codingRow.icd10 as { code: string; label: string; confidence: number }[])
          : [],
        emLevel: codingRow.emLevel,
        rationale: codingRow.rationale,
        status: codingRow.status ?? "suggested",
        approvedByName: codingRow.approvedByName ?? null,
        approvedAt: codingRow.approvedAt ? codingRow.approvedAt.toISOString() : null,
        approvedIcd10: Array.isArray(codingRow.approvedIcd10)
          ? (codingRow.approvedIcd10 as { code: string; label?: string }[])
          : null,
        approvedEmLevel: codingRow.approvedEmLevel ?? null,
      }
    : null;
  const visitCompletionBundle =
    note.status === "finalized"
      ? buildVisitCompletionBundle({
          patientFirstName: patient.firstName,
          blocks,
          codingSuggestion,
          hasFutureAppointment: Boolean(futureAppointment),
        })
      : null;
  const releasedPayload = note.visitCompletion
    ? (note.visitCompletion.payload as any)
    : null;

  // Post-finalize agent strip (audit minor #6): the downstream agents that fire
  // when this note is signed. coding-readiness keys its job input by noteId;
  // patient-outreach by encounterId; outcome-tracker carries only patientId, so
  // scope that one to jobs created at/after this note was finalized.
  const showAgentStrip = note.status === "finalized" || note.status === "amended";
  const agentJobs: AgentJobLite[] = showAgentStrip
    ? (
        await prisma.agentJob.findMany({
          where: {
            agentName: {
              in: ["codingReadiness", "patientOutreach", "outcomeTracker"],
            },
            OR: [
              { input: { path: ["noteId"], equals: note.id } },
              { input: { path: ["encounterId"], equals: note.encounterId } },
              {
                agentName: "outcomeTracker",
                input: { path: ["patientId"], equals: note.encounter.patientId },
                ...(note.finalizedAt ? { createdAt: { gte: note.finalizedAt } } : {}),
              },
            ],
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            agentName: true,
            status: true,
            lastError: true,
            completedAt: true,
          },
        })
      ).map((j) => ({
        id: j.id,
        agentName: j.agentName,
        status: j.status,
        lastError: j.lastError,
        completedAt: j.completedAt ? j.completedAt.toISOString() : null,
      }))
    : [];

  const headerStatus = noteStatusBadge(note.status);
  return (
    <PageShell maxWidth="max-w-[900px]">
      <PageHeader
        eyebrow="Clinical note"
        title={`Note — ${formatDate(note.createdAt)}`}
        description={`${patient.firstName} ${patient.lastName} · ${formatModality(note.encounter.modality)} visit`}
        actions={
          <div className="flex items-center gap-2">
            {/* Note lifecycle status, surfaced in the header (audit minor:
                status visibility) so the physician sees draft / awaiting
                co-sign / signed / amended without scrolling below the fold. */}
            <Badge tone={headerStatus.tone}>{headerStatus.label}</Badge>
            {/* ux/print-stylesheets-clinical — single-note SOAP printout */}
            <Link
              href={`/clinic/patients/${params.id}/notes/${params.noteId}/print`}
              target="_blank"
              rel="noopener"
            >
              <Button
                variant="ghost"
                leadingIcon={<Printer className="h-4 w-4" />}
              >
                Print note
              </Button>
            </Link>
            <Link href={`/clinic/patients/${params.id}?tab=notes`}>
              <Button
                variant="secondary"
                leadingIcon={<ArrowLeft className="h-4 w-4" />}
              >
                Back to chart
              </Button>
            </Link>
          </div>
        }
      />

      {canEditNotes ? (
        <NoteEditor
          noteId={note.id}
          patientId={params.id}
          patientFirstName={patient.firstName}
          encounterId={note.encounterId}
          hasFutureAppointment={Boolean(futureAppointment)}
          initialBlocks={blocks}
          status={note.status}
          aiDrafted={note.aiDrafted}
          aiConfidence={note.aiConfidence}
          hallucinationFlags={hallucinationFlags}
          hallucinationConfidence={hallucinationConfidence}
          codingSuggestion={codingSuggestion}
          initialDemeanor={
            note.encounter.briefingContext &&
            typeof note.encounter.briefingContext === "object" &&
            "patientDemeanor" in (note.encounter.briefingContext as Record<string, unknown>)
              ? ((note.encounter.briefingContext as Record<string, unknown>).patientDemeanor as any)
              : null
          }
          releasedPayload={releasedPayload}
        />
      ) : canDocObjective ? (
        <StaffObjectiveEditor
          noteId={note.id}
          patientName={`${patient.firstName} ${patient.lastName}`}
          modality={note.encounter.modality}
          status={note.status}
          initialVitals={initialVitals}
          initialExam={initialExam}
          initialAttribution={initialAttribution}
        />
      ) : (
        <ReadOnlyNote blocks={blocks} />
      )}

      {!canEditNotes && visitCompletionBundle && (
        <VisitCompletionPanel
          bundle={visitCompletionBundle}
          releasedPayload={releasedPayload}
          noteId={note.id}
        />
      )}

      {/* EMR-1152 — plain-language after-visit summary: verify + one-click release */}
      {(note.status === "finalized" || note.status === "amended") && (
        <AvsReviewPanel noteId={note.id} />
      )}

      {/* Post-finalize downstream-agent status (audit minor #6) */}
      {showAgentStrip && <AgentJobStrip jobs={agentJobs} />}

      {/* ux/comments-mentions-collab — inline collaboration on chart notes */}
      <div className="mt-8">
        <NoteCommentsPanel noteId={note.id} patientId={params.id} />
      </div>
    </PageShell>
  );
}

/** Static, read-only note render for users with `notes.read` but no edit. */
function ReadOnlyNote({
  blocks,
}: {
  blocks: { heading: string; body: string }[];
}) {
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <Card key={i}>
          <CardContent className="pt-5 pb-5 space-y-2">
            <h3 className="font-display text-lg font-medium text-text tracking-tight">
              {block.heading}
            </h3>
            <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
              {block.body}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
