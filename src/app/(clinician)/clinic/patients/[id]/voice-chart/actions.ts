"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { resolveModelClient } from "@/lib/orchestration/model-client";
import {
  buildExtractionPrompt,
  formatTranscript,
  type ScribeFormatOptions,
  type TranscriptSegment,
} from "@/lib/domain/voice-chart";
import {
  findSummaryStyle,
  findTemplate,
  findTone,
  type ScribeSummaryStyleId,
  type ScribeTemplateId,
  type ScribeToneId,
} from "@/lib/domain/scribe-templates";
import type { NoteBlockType } from "@/lib/domain/notes";
import {
  redactPii,
  scanForHallucinations,
  freezeNoteSnapshot,
  type NoteSnapshot,
} from "@/lib/agents/guardrails/note-guardrails";
import { logger } from "@/lib/observability/log";

// ── Result types ───────────────────────────────────────────────

interface NoteBlock {
  type: NoteBlockType;
  heading: string;
  body: string;
  metadata?: Record<string, unknown>;
}

interface ProcessResultOk {
  ok: true;
  noteId: string;
  blocks: NoteBlock[];
  confidence: number;
  templateId: ScribeTemplateId;
  toneId: ScribeToneId;
  summaryStyleId: ScribeSummaryStyleId;
  sectionOrder: NoteBlockType[];
  documentHeader: string;
}

export interface ProcessTranscriptOptions extends ScribeFormatOptions {}

interface ProcessResultError {
  ok: false;
  error: string;
}

type ProcessResult = ProcessResultOk | ProcessResultError;

// ── Helpers ────────────────────────────────────────────────────

/**
 * Try to extract and parse JSON from a model response.
 * The model may wrap the JSON in markdown code fences.
 */
function tryParseJSON(text: string): any | null {
  const jsonMatch =
    text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[1] || jsonMatch[0]);
  } catch {
    return null;
  }
}

function ageFromDob(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

// ── Actions ────────────────────────────────────────────────────

/**
 * Process a voice transcript through the AI to extract structured SOAP notes.
 * Creates a draft Note attached to the encounter.
 */
export async function processTranscript(
  encounterId: string,
  transcript: string,
  patientId: string,
  options: ProcessTranscriptOptions = {},
): Promise<ProcessResult> {
  try {
    const user = await requireUser();

    // Resolve the requested scribe template / tone / summary style.
    // Each lookup falls back to a sane default when an id is missing
    // or unrecognized, so older callers that pass nothing still work.
    const template = findTemplate(options.templateId ?? "soap");
    const tone = findTone(options.toneId ?? template.defaultTone);
    const summaryStyle = findSummaryStyle(options.summaryStyleId ?? "structured");

    // Load patient with chart summary
    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        organizationId: user.organizationId!,
        deletedAt: null,
      },
      include: { chartSummary: true },
    });

    if (!patient) {
      return { ok: false, error: "Patient not found." };
    }

    // Build patient context string
    const agePart = patient.dateOfBirth
      ? `${ageFromDob(patient.dateOfBirth)} years old`
      : "age unknown";

    const cannabisHistory = patient.cannabisHistory
      ? typeof patient.cannabisHistory === "string"
        ? patient.cannabisHistory
        : JSON.stringify(patient.cannabisHistory, null, 2)
      : "No cannabis history on file.";

    const summaryMd =
      patient.chartSummary?.summaryMd ?? "No chart summary yet.";

    const patientContext = `
PATIENT: ${patient.firstName} ${patient.lastName}, ${agePart}

PRESENTING CONCERNS: ${patient.presentingConcerns ?? "Not documented"}

TREATMENT GOALS: ${patient.treatmentGoals ?? "Not documented"}

CANNABIS HISTORY:
${cannabisHistory}

CHART SUMMARY:
${summaryMd}
`.trim();

    // EMR-131: Pre-model PII redaction. Strip names, phone, SSN, email,
    // MRN-shaped tokens, and DOBs from the transcript before the model
    // sees it. The structured note that comes back can still reference
    // the patient (the chart UI re-hydrates the name from the patient
    // row), so the model never needs the literal PII.
    const knownNames = [
      patient.firstName,
      patient.lastName,
      `${patient.firstName} ${patient.lastName}`,
    ].filter((n): n is string => Boolean(n && n.length > 1));
    const { redacted: scrubbedTranscript, counts: redactionCounts } = redactPii(
      transcript,
      knownNames,
    );

    // Call model with the extraction prompt (against the scrubbed transcript).
    // The template/tone/summary-style triple shapes both the prompt and
    // the section ordering of the returned blocks.
    const model = resolveModelClient();
    const prompt = buildExtractionPrompt(scrubbedTranscript, patientContext, {
      templateId: template.id,
      toneId: tone.id,
      summaryStyleId: summaryStyle.id,
    });

    const modelResponse = await model.complete(prompt, {
      maxTokens: 1024,
      temperature: 0.3,
    });

    // Parse the structured JSON response
    const parsed = tryParseJSON(modelResponse);

    let confidence: number;
    let suggestedCodes: { code: string; label: string }[] = [];
    let blocks: NoteBlock[];

    if (parsed && typeof parsed === "object" && parsed.assessment) {
      confidence =
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.7;

      suggestedCodes = Array.isArray(parsed.suggestedCodes)
        ? parsed.suggestedCodes
            .filter(
              (c: any) =>
                typeof c === "object" &&
                typeof c.code === "string" &&
                typeof c.label === "string"
            )
            .map((c: any) => ({ code: c.code, label: c.label }))
        : [];

      blocks = [
        {
          type: "summary" as const,
          heading: "Summary",
          body:
            parsed.summary ??
            template.mockSummary.summary ??
            `${patient.firstName} ${patient.lastName} presented for a visit.`,
        },
        {
          type: "findings" as const,
          heading: "Relevant findings",
          body:
            parsed.findings ??
            template.mockSummary.findings ??
            "See transcript.",
        },
        {
          type: "assessment" as const,
          heading: "Assessment",
          body: parsed.assessment ?? template.mockSummary.assessment,
        },
        {
          type: "plan" as const,
          heading: "Plan",
          body:
            parsed.plan ??
            template.mockSummary.plan ??
            "-- draft, pending clinician input --",
        },
        {
          type: "followUp" as const,
          heading: "Follow-up",
          body:
            parsed.followUp ??
            template.mockSummary.followUp ??
            "Schedule follow-up as appropriate.",
        },
      ];

      // Attach suggestedCodes as metadata on the assessment block
      if (suggestedCodes.length > 0) {
        blocks[2] = { ...blocks[2], metadata: { suggestedCodes } };
      }
    } else {
      // Fallback: model returned plain text. Seed the draft from the
      // selected template's mock summary so the clinician sees a
      // realistically-shaped note for the chosen format instead of
      // an empty SOAP skeleton.
      confidence = 0.5;
      blocks = [
        {
          type: "summary" as const,
          heading: "Summary",
          body:
            template.mockSummary.summary ||
            `${patient.firstName} ${patient.lastName} presented for a visit.`,
        },
        {
          type: "findings" as const,
          heading: "Relevant findings",
          body:
            template.mockSummary.findings ||
            modelResponse ||
            "Unable to extract findings from transcript.",
        },
        {
          type: "assessment" as const,
          heading: "Assessment",
          body:
            template.mockSummary.assessment ||
            "-- draft, pending clinician review --",
        },
        {
          type: "plan" as const,
          heading: "Plan",
          body:
            template.mockSummary.plan ||
            "-- draft, pending clinician input --",
        },
        {
          type: "followUp" as const,
          heading: "Follow-up",
          body:
            template.mockSummary.followUp ||
            "Schedule follow-up as appropriate.",
        },
      ];
    }

    // EMR-131: Hallucination scan over the draft. Conservative — flags
    // sentences whose content has no overlap with the redacted
    // transcript or chart context. Surfaced inline in the editor.
    const hallucination = scanForHallucinations(
      blocks,
      scrubbedTranscript,
      patientContext,
    );
    const guardrails = {
      redactionCounts,
      hallucinationConfidence: hallucination.confidence,
      flaggedSpans: hallucination.flags,
    };

    // Reorder blocks per the template's section order so the note
    // editor renders them in the order Heidi-style templates expect
    // (e.g. SOAP vs. consult letter vs. progress note differ here).
    const orderedBlocks = template.sectionOrder
      .map((sectionType) => blocks.find((b) => b.type === sectionType))
      .filter((b): b is NoteBlock => Boolean(b));

    // Persist the draft note with guardrail + template metadata baked
    // in so the editor and the snapshot freeze on finalize can read
    // it back. Template metadata lets the editor render the right
    // header and section ordering without re-deriving from the prompt.
    const note = await prisma.note.create({
      data: {
        encounterId,
        status: "draft",
        aiDrafted: true,
        aiConfidence: Math.min(confidence, hallucination.confidence),
        blocks: [
          ...orderedBlocks,
          {
            type: "metadata" as any,
            heading: "_scribe",
            body: "",
            metadata: {
              templateId: template.id,
              templateLabel: template.label,
              documentHeader: template.documentHeader,
              toneId: tone.id,
              toneLabel: tone.label,
              summaryStyleId: summaryStyle.id,
              summaryStyleLabel: summaryStyle.label,
              sectionOrder: template.sectionOrder,
            },
          },
          {
            type: "metadata" as any,
            heading: "_guardrails",
            body: "",
            metadata: { guardrails, transcriptPreview: scrubbedTranscript.slice(0, 4000) },
          },
        ] as any,
      },
    });

    return {
      ok: true,
      noteId: note.id,
      blocks: orderedBlocks,
      confidence: Math.min(confidence, hallucination.confidence),
      templateId: template.id,
      toneId: tone.id,
      summaryStyleId: summaryStyle.id,
      sectionOrder: template.sectionOrder,
      documentHeader: template.documentHeader,
    };
  } catch (err) {
    logger.error({ event: "clinic.voice_chart.process_transcript_failed", err });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to process transcript.",
    };
  }
}

/**
 * Save the raw transcript segments to the encounter's briefingContext field.
 */
export async function saveTranscriptToEncounter(
  encounterId: string,
  transcript: TranscriptSegment[]
): Promise<void> {
  await requireUser();

  await prisma.encounter.update({
    where: { id: encounterId },
    data: {
      briefingContext: JSON.parse(
        JSON.stringify({
          voiceTranscript: transcript,
          capturedAt: new Date().toISOString(),
          formattedTranscript: formatTranscript(transcript),
        })
      ),
    },
  });
}

/**
 * Start a voice encounter: find or create an in-progress encounter for today.
 * Unlike startVisit, this does NOT dispatch the scribe agent — the clinician
 * will record first, then process the transcript through AI extraction.
 */
export async function startVoiceEncounter(
  patientId: string
): Promise<{ encounterId: string }> {
  const user = await requireUser();

  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });

  if (!patient) {
    throw new Error("Patient not found.");
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Reuse an existing in-progress encounter for today if one exists
  let encounter = await prisma.encounter.findFirst({
    where: {
      patientId,
      organizationId: user.organizationId!,
      status: "in_progress",
      createdAt: { gte: todayStart, lte: todayEnd },
    },
  });

  if (!encounter) {
    encounter = await prisma.encounter.create({
      data: {
        organizationId: user.organizationId!,
        patientId,
        status: "in_progress",
        modality: "in_person",
        reason: "Voice-documented visit",
        startedAt: new Date(),
        scheduledFor: new Date(),
      },
    });
  }

  return { encounterId: encounter.id };
}
