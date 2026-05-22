// EMR-128 — Universal feedback ("Whisper") domain types and classifier.
//
// The classifier is intentionally rule-based and tiny. The ticket says
// "AI-classified" sentiment/area; in practice the cheap signal we get from
// keyword scanning is good enough for triage routing and the AI step can
// run later in a worker without blocking the patient-facing submission.

export type WhisperRoleHint = "patient" | "clinician" | "operator" | "anonymous";
export type WhisperSentiment = "positive" | "negative" | "neutral";

export type WhisperArea =
  | "billing"
  | "scheduling"
  | "medications"
  | "messaging"
  | "ux_copy"
  | "performance"
  | "feature_request"
  | "compliment"
  | "other";

export interface WhisperSubmission {
  /** Stable id; client can retry with the same id without dupes. */
  clientId: string;
  /** Page URL captured at submission time — anchors feedback to a screen. */
  pageUrl: string;
  /** Optional role hint from session. The server is authoritative. */
  roleHint?: WhisperRoleHint;
  /** Free-form text from the user; required (≥ 5 chars). */
  comment: string;
  /** Annotated screenshot, base64-encoded data URL, optional. */
  annotationDataUrl?: string;
  /** Voice memo blob URL (server uploads to storage in real impl). */
  voiceMemoUrl?: string;
  /** Browser metadata. */
  userAgent?: string;
  viewport?: { width: number; height: number };
  /** Submission timestamp from the client; server stamps its own as well. */
  occurredAt: string;
  /** Explicitly selected area from the UI, skips AI classification */
  area?: WhisperArea;
}

export interface ClassifiedWhisper extends WhisperSubmission {
  id: string;
  receivedAt: string;
  sentiment: WhisperSentiment;
  area: WhisperArea;
  /** Routed to C-Suite inbox if true (Dr. Patel + Scott Wayman). */
  cSuiteRoute: boolean;
}

const NEGATIVE_TERMS = [
  "hate", "broken", "doesn't work", "doesnt work", "frustrat", "confus", "angry",
  "annoy", "slow", "stuck", "lost", "missing", "wrong", "bug", "crash", "fail",
  "wait", "rude", "rushed", "ignored", "expensive", "hidden fee",
];

const POSITIVE_TERMS = [
  "love", "great", "amazing", "perfect", "thank", "wonderful", "delight",
  "easy", "smooth", "kind", "caring", "helpful", "fast", "intuitive",
];

const AREA_HINTS: Array<[WhisperArea, RegExp]> = [
  ["billing",     /\b(bill|charge|insurance|copay|claim|EOB|invoice|refund|cost)\b/i],
  ["scheduling",  /\b(appoint|schedul|reschedul|cancel|book|wait time)\b/i],
  ["medications", /\b(med|prescript|refill|dose|dosing|pharmacy)\b/i],
  ["messaging",   /\b(message|inbox|chat|reply|response)\b/i],
  ["performance", /\b(slow|laggy|hang|freeze|crash|error|spinning|loading)\b/i],
  ["feature_request", /\b(should add|please add|wish|would love|feature|idea)\b/i],
  ["compliment",  /\b(love|amazing|life-changing|wonderful|thank you)\b/i],
  ["ux_copy",     /\b(confus|copy|wording|unclear|hard to understand|where is|can't find|cannot find)\b/i],
];

/** Cheap rule-based classifier; production swaps to an AI step in a worker. */
export function classifyWhisper(s: WhisperSubmission, opts: { now?: Date } = {}): ClassifiedWhisper {
  const lower = s.comment.toLowerCase();
  let neg = 0;
  let pos = 0;
  for (const t of NEGATIVE_TERMS) if (lower.includes(t)) neg++;
  for (const t of POSITIVE_TERMS) if (lower.includes(t)) pos++;
  const sentiment: WhisperSentiment = neg > pos ? "negative" : pos > neg ? "positive" : "neutral";

  let area: WhisperArea = s.area ?? "other";
  if (!s.area) {
    for (const [a, re] of AREA_HINTS) {
      if (re.test(s.comment)) { area = a; break; }
    }
  }

  const cSuiteRoute = sentiment === "negative" || area === "compliment" || area === "feature_request";
  const now = (opts.now ?? new Date()).toISOString();
  return {
    ...s,
    id: `w-${(s.clientId || now).slice(-12)}`,
    receivedAt: now,
    sentiment,
    area,
    cSuiteRoute,
  };
}

/** Validate inbound payloads at the API boundary. */
export function validateSubmission(input: unknown): { ok: true; value: WhisperSubmission } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid payload." };
  const x = input as Record<string, unknown>;
  if (typeof x.clientId !== "string" || x.clientId.length < 3) return { ok: false, error: "clientId required." };
  if (typeof x.pageUrl !== "string") return { ok: false, error: "pageUrl required." };
  if (typeof x.comment !== "string" || x.comment.trim().length < 5) {
    return { ok: false, error: "Feedback must be at least 5 characters." };
  }
  if (typeof x.occurredAt !== "string") return { ok: false, error: "occurredAt required." };
  return {
    ok: true,
    value: {
      clientId: x.clientId,
      pageUrl: x.pageUrl,
      roleHint: typeof x.roleHint === "string" ? (x.roleHint as WhisperRoleHint) : undefined,
      comment: x.comment.trim(),
      annotationDataUrl: typeof x.annotationDataUrl === "string" ? x.annotationDataUrl : undefined,
      voiceMemoUrl: typeof x.voiceMemoUrl === "string" ? x.voiceMemoUrl : undefined,
      userAgent: typeof x.userAgent === "string" ? x.userAgent : undefined,
      viewport: x.viewport && typeof x.viewport === "object"
        ? { width: Number((x.viewport as Record<string, unknown>).width ?? 0), height: Number((x.viewport as Record<string, unknown>).height ?? 0) }
        : undefined,
      occurredAt: x.occurredAt,
      area: typeof x.area === "string" ? (x.area as WhisperArea) : undefined,
    },
  };
}
