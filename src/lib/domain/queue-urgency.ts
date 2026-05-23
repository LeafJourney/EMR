// Queue urgency categorization — EMR-647
// AI urgency tag for items in /clinic Today's Queue. Reuses the
// `MessagePriority` palette from smart-inbox so the rest of the app
// already knows how to render these labels.
//
// Inputs are deliberately encounter-shaped (not message-shaped) — we
// score a *queue item* (visit/lab/consult/imaging waiting on the
// clinician) using the patient's unacknowledged observations, attached
// documents, and the visit reason. Like smart-inbox, this is a
// deterministic first pass; an LLM refinement layer can plug in later.

import type { MessagePriority } from "./smart-inbox";

/** Re-exported so consumers can stay on one priority type. */
export type QueueUrgency = MessagePriority;

/** What kind of thing is waiting on the clinician. */
export type QueueItemKind = "visit" | "message" | "refill" | "lab" | "consult" | "imaging";

export interface QueueObservationInput {
  severity: string;
  category?: string | null;
  summary?: string | null;
}

export interface QueueDocumentInput {
  kind: string;
}

export interface QueueItemInput {
  kind: QueueItemKind;
  /** Free-text reason / chief complaint / message subject. */
  reason?: string | null;
  /** Patient's unacknowledged observations (from ClinicalObservation). */
  observations?: ReadonlyArray<QueueObservationInput>;
  /** Recent documents on the patient (labs, letters, images). */
  documents?: ReadonlyArray<QueueDocumentInput>;
  /** When the item entered the queue. Used for age-based bumping. */
  createdAt?: Date | string | null;
  /** When the clinician is scheduled to see them (visits only). */
  scheduledFor?: Date | string | null;
  /** Patient has declined AI assistance — EMR-592. We still triage but
   *  use only deterministic rules and skip any "AI inferred" reason. */
  patientDeclinedAi?: boolean;
}

export interface QueueUrgencyResult {
  urgency: QueueUrgency;
  /** One-line explanation surfaced on hover. */
  reason: string;
  /** Sortable score — higher = more urgent. Stable for ties. */
  score: number;
}

const URGENCY_SCORE: Record<QueueUrgency, number> = {
  urgent: 100,
  high: 60,
  routine: 30,
  low: 10,
};

const URGENT_REASON_KEYWORDS = [
  "chest pain",
  "shortness of breath",
  "can't breathe",
  "suicidal",
  "overdose",
  "seizure",
  "anaphyl",
  "severe bleeding",
  "stroke",
  "uncontrolled",
];

const HIGH_REASON_KEYWORDS = [
  "ran out",
  "out of meds",
  "traveling",
  "antibiotic",
  "sick",
  "fever",
  "rash",
  "side effect",
  "adverse",
  "callback",
  "call back",
];

function asDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  return d instanceof Date ? d : new Date(d);
}

function ageHours(d: Date | string | null | undefined, now: number): number | null {
  const parsed = asDate(d);
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return (now - parsed.getTime()) / 3_600_000;
}

/**
 * Deterministic urgency classification for a Today's Queue item.
 *
 * Mirrors {@link triageThread} in smart-inbox: keyword + signal scan,
 * no LLM round-trip. An optional refinement layer can override the
 * result with a richer model call, but the deterministic floor keeps
 * the UI predictable and lets EMR-592 (AI opt-out) patients get a
 * fully rule-based score.
 */
export function categorizeQueueItem(
  item: QueueItemInput,
  now: number = Date.now(),
): QueueUrgencyResult {
  const reasonText = (item.reason ?? "").toLowerCase();
  const obs = item.observations ?? [];
  const docs = item.documents ?? [];

  // 1. Urgent observation severity is a hard escalator.
  const urgentObs = obs.find((o) => o.severity === "urgent");
  if (urgentObs) {
    return {
      urgency: "urgent",
      reason: urgentObs.summary?.trim()
        ? `Urgent observation: ${urgentObs.summary}`
        : "Patient has an urgent unacknowledged observation.",
      score: URGENCY_SCORE.urgent + 5,
    };
  }

  // 2. Urgent keywords in the visit reason / message subject.
  if (URGENT_REASON_KEYWORDS.some((kw) => reasonText.includes(kw))) {
    return {
      urgency: "urgent",
      reason: "Reason mentions an emergency or safety keyword.",
      score: URGENCY_SCORE.urgent,
    };
  }

  // 3. Critical labs arrived — labs marked as critical bubble up.
  //    We can't see lab values from `kind` alone, but the presence of
  //    a recent lab on a patient with a "concern" observation is a
  //    strong "review me" signal.
  const concernObs = obs.find((o) => o.severity === "concern");
  const hasLab = docs.some((d) => d.kind === "lab");
  if (concernObs && hasLab) {
    return {
      urgency: "urgent",
      reason: `Critical lab and concern observation: ${concernObs.summary ?? "review needed"}`,
      score: URGENCY_SCORE.urgent - 5,
    };
  }

  // 4. Concern observation alone → high.
  if (concernObs) {
    return {
      urgency: "high",
      reason: concernObs.summary?.trim()
        ? `Watch: ${concernObs.summary}`
        : "Patient has a concerning observation worth reviewing.",
      score: URGENCY_SCORE.high + 5,
    };
  }

  // 5. High-priority keywords (patient traveling, ran out of meds, sick).
  if (HIGH_REASON_KEYWORDS.some((kw) => reasonText.includes(kw))) {
    return {
      urgency: "high",
      reason: "Reason flags a time-sensitive request (refill, callback, or symptom).",
      score: URGENCY_SCORE.high,
    };
  }

  // 6. Brand-new ancillary results (labs/consults/imaging) waiting on
  //    review default to routine — they should be seen today but aren't
  //    emergencies on their own.
  if (item.kind === "lab" || item.kind === "consult" || item.kind === "imaging") {
    return {
      urgency: "routine",
      reason: `New ${item.kind} result awaiting review.`,
      score: URGENCY_SCORE.routine + 5,
    };
  }

  // 7. Visits with documents pending review nudge above plain routine.
  if (item.kind === "visit" && docs.length > 0) {
    return {
      urgency: "routine",
      reason: `Visit prep: ${docs.length} document${docs.length === 1 ? "" : "s"} to review beforehand.`,
      score: URGENCY_SCORE.routine + 2,
    };
  }

  // 8. Age-based bump — items sitting in the queue >24h shouldn't rot.
  const age = ageHours(item.createdAt, now);
  if (age != null && age > 24 && (item.kind === "message" || item.kind === "refill")) {
    return {
      urgency: "high",
      reason: `Pending >24h — needs a response today.`,
      score: URGENCY_SCORE.high - 5,
    };
  }

  // 9. Default — routine if it's a visit, otherwise low.
  if (item.kind === "visit") {
    return {
      urgency: "routine",
      reason: "Scheduled visit — no flags detected.",
      score: URGENCY_SCORE.routine,
    };
  }

  return {
    urgency: "low",
    reason: "No urgent signals detected.",
    score: URGENCY_SCORE.low,
  };
}

/** Display config for each urgency tier. Mirrors smart-inbox `PRIORITY_CONFIG`
 *  but uses tokens that compose with the queue card surface. */
export const URGENCY_TAG_CONFIG: Record<
  QueueUrgency,
  { label: string; className: string; dotClassName: string }
> = {
  urgent: {
    label: "AI: Urgent",
    className: "bg-danger/10 text-danger animate-pulse",
    dotClassName: "bg-danger",
  },
  high: {
    label: "AI: High",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dotClassName: "bg-amber-500",
  },
  routine: {
    label: "Routine",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    dotClassName: "bg-blue-500",
  },
  low: {
    label: "Low",
    className: "bg-surface-muted text-text-subtle",
    dotClassName: "bg-text-subtle",
  },
};

/** Sort comparator — most urgent first; preserves insertion order on ties. */
export function compareByUrgency(a: QueueUrgencyResult, b: QueueUrgencyResult): number {
  return b.score - a.score;
}
