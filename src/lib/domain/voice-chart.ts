// Voice-to-Chart domain types and utilities — EMR-156
// Ambient documentation: record a visit, transcribe, extract structured SOAP notes.
//
// EMR-782 extends this with a Heidi AI-style scribe layer: templates,
// tones, and summary styles that reshape the extraction prompt and
// the resulting note structure.

import type { NoteBlockType } from "./notes";
import {
  findSummaryStyle,
  findTemplate,
  findTone,
  type ScribeSummaryStyleId,
  type ScribeTemplateId,
  type ScribeToneId,
} from "./scribe-templates";

export interface ScribeFormatOptions {
  templateId?: ScribeTemplateId;
  toneId?: ScribeToneId;
  summaryStyleId?: ScribeSummaryStyleId;
}

// ── Recording session states ────────────────────────────
export type RecordingStatus = "idle" | "recording" | "paused" | "processing" | "complete" | "error";

export interface TranscriptSegment {
  /** Speaker label: "clinician" | "patient" | "unknown" */
  speaker: "clinician" | "patient" | "unknown";
  /** Transcript text */
  text: string;
  /** Start time in seconds from recording start */
  startTime: number;
  /** End time in seconds */
  endTime: number;
}

export interface VoiceSession {
  id: string;
  encounterId: string;
  patientId: string;
  status: RecordingStatus;
  startedAt: string;
  /** Duration in seconds */
  duration: number;
  transcript: TranscriptSegment[];
  /** Extracted SOAP sections (after AI processing) */
  extractedSections?: Record<NoteBlockType, string>;
  /** Overall confidence of transcription + extraction */
  confidence?: number;
}

// ── Prompt for structured extraction ────────────────────

/**
 * System prompt for converting a visit transcript into structured note blocks.
 * The model receives the full transcript and patient context, and returns JSON.
 *
 * The `format` argument selects a Heidi AI-style template + tone +
 * summary style. When omitted, the prompt falls back to the original
 * SOAP-style instructions for backwards compatibility with callers
 * that haven't been migrated to the template picker.
 */
export function buildExtractionPrompt(
  transcript: string,
  patientContext: string,
  format?: ScribeFormatOptions,
): string {
  const template = findTemplate(format?.templateId ?? "soap");
  const tone = findTone(format?.toneId ?? template.defaultTone);
  const summaryStyle = findSummaryStyle(format?.summaryStyleId ?? "structured");

  const sectionGuidanceBlock = template.sectionOrder
    .map((section) => {
      const hint = template.sectionGuidance[section];
      return hint ? `- ${section}: ${hint}` : `- ${section}`;
    })
    .join("\n");

  return `You are an expert medical scribe for a cannabis care practice. You have been given a transcript of a patient visit and relevant patient context. Extract a structured clinical note from the conversation.

DOCUMENT TYPE: ${template.documentHeader} (${template.label})
TONE: ${tone.label} — ${tone.instruction}
SUMMARY STYLE: ${summaryStyle.label} — ${summaryStyle.instruction}

PATIENT CONTEXT:
${patientContext}

VISIT TRANSCRIPT:
${transcript}

Per-section guidance for this template:
${sectionGuidanceBlock}

Return ONLY valid JSON in this exact format:
{
  "summary": "Subjective / interval summary, following the tone and summary style above",
  "findings": "Objective section — leave empty string if this template does not use it",
  "assessment": "Clinical assessment per the template guidance",
  "plan": "Treatment plan per the template guidance",
  "followUp": "Follow-up instructions per the template guidance",
  "templateId": "${template.id}",
  "toneId": "${tone.id}",
  "summaryStyleId": "${summaryStyle.id}",
  "suggestedCodes": [
    { "code": "ICD-10 code", "label": "Description" }
  ],
  "confidence": 0.85
}

Guidelines:
- Extract only what was actually discussed in the transcript
- Do NOT fabricate findings or plans that weren't mentioned
- Attribute statements to the correct speaker (clinician vs patient)
- Flag any safety concerns mentioned (falls, adverse reactions, etc.)
- Include cannabis-specific details: product, dose, route, frequency, response
- Follow the requested tone and summary style consistently across every section
- Set confidence 0.0-1.0 based on transcript clarity and completeness`;
}

/**
 * Format transcript segments into a readable text block for the AI prompt.
 */
export function formatTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => {
      const speaker = s.speaker === "clinician" ? "Dr" : s.speaker === "patient" ? "Pt" : "??";
      const time = formatTime(s.startTime);
      return `[${time}] ${speaker}: ${s.text}`;
    })
    .join("\n");
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Estimate word count from transcript segments.
 */
export function wordCount(segments: TranscriptSegment[]): number {
  return segments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
}
