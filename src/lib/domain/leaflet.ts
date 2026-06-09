// Leaflet — After Visit Summary types + assembly helpers
// EMR-148 / EMR-149

import type { NoteBlock } from "@/lib/domain/notes";

export interface LeafletVisit {
  date: string;
  provider: string;
  modality: string;
  reason: string | null;
}

export interface LeafletMedication {
  name: string;
  dosage: string;
  instructions: string | null;
  type: "cannabis" | "prescription" | "supplement" | "otc";
}

export interface LeafletData {
  patientName: string;
  patientDOB: string | null;
  allergies: string[];
  visit: LeafletVisit;
  discussed: string;
  carePlan: LeafletMedication[];
  carePlanNotes: string;
  nextSteps: string[];
  followUp: string;
  narrativeSource: string; // raw text for AI narrative generation
  generatedAt: string;
}

/** Extract text from note blocks by type */
export function extractNoteSection(blocks: unknown, type: string): string {
  if (!Array.isArray(blocks)) return "";
  const typed = blocks as NoteBlock[];
  const block = typed.find((b) => b.type === type);
  return block?.body?.trim() ?? "";
}

/**
 * Extract action items from the signed plan text. Prefers explicit bullet
 * lines, but falls back to splitting prose into sentences — otherwise a plan
 * written as a single paragraph (the common case) yields NO items and the
 * caller substitutes a generic "Continue current care plan" that can directly
 * contradict the documented changes.
 */
export function extractActionItems(planText: string): string[] {
  if (!planText) return [];
  const hasBullets = /(^|\n)\s*[-•*]/.test(planText);
  const lines = planText
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\-•*\d.)]+/, "").trim())
    .filter(Boolean);
  const candidates = hasBullets
    ? lines
    : lines
        .flatMap((line) => line.split(/(?<=[.!?])\s+/))
        .map((s) => s.trim())
        .filter(Boolean);
  return candidates.filter((s) => s.length > 5 && s.length <= 200).slice(0, 6);
}

/** Human label for a visit modality enum (never leak the raw "in_person"). */
export function formatVisitModality(modality: string): string {
  switch (modality) {
    case "video":
      return "video";
    case "phone":
      return "phone";
    case "in_person":
    case "in-person":
      return "in-person";
    default:
      return modality.replace(/_/g, "-");
  }
}

/** Modality phrase with the correct indefinite article ("an in-person", "a video"). */
function visitModalityPhrase(modality: string): string {
  const label = formatVisitModality(modality);
  return /^[aeiou]/i.test(label) ? `an ${label}` : `a ${label}`;
}

/**
 * Patient-facing copy must never leak un-interpolated template placeholders
 * like "[visit type: history & physical]". Strip bracketed tokens and collapse
 * whitespace; return null if nothing meaningful is left.
 */
export function sanitizeReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const cleaned = reason.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** Build a deterministic narrative from visit data */
export function buildDeterministicNarrative(data: LeafletData): string {
  const parts: string[] = [];

  const reason = sanitizeReason(data.visit.reason);
  parts.push(
    `Today ${data.patientName.split(" ")[0]} had ${visitModalityPhrase(data.visit.modality)} visit` +
    (reason ? ` for ${reason.toLowerCase()}` : "") +
    "."
  );

  if (data.discussed) {
    const summary = data.discussed.length > 150
      ? data.discussed.slice(0, 147) + "..."
      : data.discussed;
    parts.push(`We discussed: ${summary}`);
  }

  if (data.carePlan.length > 0) {
    const medNames = data.carePlan.slice(0, 3).map((m) => m.name).join(", ");
    parts.push(`Current medications include ${medNames}.`);
  }

  if (data.nextSteps.length > 0) {
    parts.push(`Next steps: ${data.nextSteps[0]}.`);
  }

  parts.push(data.followUp);

  return parts.join(" ");
}
