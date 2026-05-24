// EMR-675 — Unresolved follow-up items in chart, convert to tasks.
//
// Derives "loose ends" server-side from finalized note Plan/Follow-up
// blocks + triaged message threads. Tasks created from a follow-up
// embed `[sourceRef:noteId|threadId:...]` in their description so
// converted items drop off automatically — no parallel followup model.

import type { TaskStatus } from "@prisma/client";

// Structural duck-types — easier to unit-test without Prisma.
export interface NoteLike {
  id: string;
  encounterId: string;
  status: string;
  finalizedAt?: Date | string | null;
  createdAt: Date | string;
  blocks: unknown;
  narrative?: string | null;
}
export interface ThreadLike {
  id: string;
  subject: string;
  lastMessageAt: Date | string;
  triageCategory?: string | null;
  triageUrgency?: string | null;
  triageSummary?: string | null;
}
export interface TaskLike {
  description?: string | null;
  status: TaskStatus | string;
}

export type UnresolvedFollowUpSource = "note" | "message";
export interface UnresolvedFollowUp {
  id: string;
  source: UnresolvedFollowUpSource;
  title: string;
  detail?: string;
  surfacedAt: string;
  href: string;
  sourceRef: string;
  severity: "info" | "warning" | "danger";
}

const FOLLOWUP_PHRASE_RE =
  /(?:^|[.\n•–—\-])\s*([^\n.]*?\b(?:follow[- ]?up|recheck|repeat|titrate|reassess|re[- ]?evaluate|reorder|refill review|labs?\s+in\b|return\s+in\b|f\/u)\b[^\n.]{0,140})/gi;

function blocksToText(blocks: unknown): { heading: string; body: string }[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((b: unknown) =>
    b &&
    typeof b === "object" &&
    typeof (b as { heading?: unknown }).heading === "string" &&
    typeof (b as { body?: unknown }).body === "string"
      ? [{ heading: (b as { heading: string }).heading, body: (b as { body: string }).body }]
      : [],
  );
}

function ageSeverity(iso: string): UnresolvedFollowUp["severity"] {
  const ageDays = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (ageDays > 30) return "danger";
  if (ageDays > 14) return "warning";
  return "info";
}

/**
 * Extract follow-up snippets from Plan/Follow-up blocks of a finalized
 * note (or narrative fallback). Capped at 3/note.
 */
export function extractFollowUpsFromNote(
  note: NoteLike,
  patientId: string,
): UnresolvedFollowUp[] {
  if (note.status !== "finalized" && note.status !== "amended") return [];

  const blocks = blocksToText(note.blocks).filter((b) => {
    const h = b.heading.toLowerCase();
    return h.includes("plan") || h.includes("follow");
  });
  const haystack = blocks.map((b) => b.body).join("\n").trim() || (note.narrative ?? "").trim();
  if (!haystack) return [];

  const out: UnresolvedFollowUp[] = [];
  const seen = new Set<string>();
  FOLLOWUP_PHRASE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FOLLOWUP_PHRASE_RE.exec(haystack)) !== null) {
    const raw = (match[1] || "").trim().replace(/\s+/g, " ");
    const key = raw.toLowerCase();
    if (raw.length < 6 || seen.has(key)) continue;
    seen.add(key);
    const surfaced =
      (note.finalizedAt && new Date(note.finalizedAt).toISOString()) ||
      new Date(note.createdAt).toISOString();
    out.push({
      id: `note:${note.id}:${out.length}`,
      source: "note",
      title: raw.length > 140 ? raw.slice(0, 137) + "…" : raw,
      detail: `From visit note · ${new Date(surfaced).toLocaleDateString()}`,
      surfacedAt: surfaced,
      href: `/clinic/patients/${patientId}/notes/${note.id}`,
      sourceRef: `noteId:${note.id}`,
      severity: ageSeverity(surfaced),
    });
    if (out.length >= 3) break;
  }
  return out;
}

const THREAD_FOLLOWUP_CATEGORIES = new Set([
  "follow_up",
  "symptom_report",
  "refill_request",
  "lab_result",
  "side_effect",
]);

/** Surface threads triaged as needing clinician action. */
export function extractFollowUpFromThread(
  thread: ThreadLike,
  patientId: string,
): UnresolvedFollowUp | null {
  const category = (thread.triageCategory || "").toLowerCase();
  const urgency = (thread.triageUrgency || "").toLowerCase();
  const urgent = urgency === "high" || urgency === "emergency";
  if (!category && !urgent) return null;
  if (category && !THREAD_FOLLOWUP_CATEGORIES.has(category) && !urgent) return null;

  const surfaced = new Date(thread.lastMessageAt).toISOString();
  return {
    id: `thread:${thread.id}`,
    source: "message",
    title:
      thread.triageSummary?.trim() ||
      thread.subject ||
      "Patient message awaiting follow-up",
    detail:
      `Patient message · ${new Date(surfaced).toLocaleDateString()}` +
      (urgency ? ` · ${urgency}` : ""),
    surfacedAt: surfaced,
    href: `/clinic/patients/${patientId}?tab=correspondence`,
    sourceRef: `threadId:${thread.id}`,
    severity: urgent ? "danger" : ageSeverity(surfaced),
  };
}

/** Compose panel input; filter out anything an existing Task references. */
export function buildUnresolvedFollowUps(input: {
  patientId: string;
  notes: NoteLike[];
  threads: ThreadLike[];
  existingTasks: TaskLike[];
  limit?: number;
}): UnresolvedFollowUp[] {
  const { patientId, notes, threads, existingTasks, limit = 6 } = input;

  const resolvedRefs = new Set(
    existingTasks.map((t) => extractSourceRef(t.description)).filter((s): s is string => !!s),
  );

  const fromNotes = notes.flatMap((n) => extractFollowUpsFromNote(n, patientId));
  const fromThreads = threads
    .map((t) => extractFollowUpFromThread(t, patientId))
    .filter((x): x is UnresolvedFollowUp => x !== null);

  const rank = { danger: 0, warning: 1, info: 2 } as const;
  return [...fromNotes, ...fromThreads]
    .filter((f) => !resolvedRefs.has(f.sourceRef))
    .sort(
      (a, b) =>
        rank[a.severity] - rank[b.severity] ||
        new Date(b.surfacedAt).getTime() - new Date(a.surfacedAt).getTime(),
    )
    .slice(0, limit);
}

export function extractSourceRef(description?: string | null): string | null {
  if (!description) return null;
  const m = description.match(/\[sourceRef:([^\]]+)\]/);
  return m ? m[1].trim() : null;
}

export function encodeSourceRef(ref: string): string {
  return `[sourceRef:${ref}]`;
}
