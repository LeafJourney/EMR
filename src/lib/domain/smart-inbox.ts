// Smart Inbox domain types — EMR-153
// AI-triaged message queue for clinicians.
//
// EMR-1146/1147 (fixes EMR-1090): the deterministic UPI engine
// (src/lib/triage/upi) is now the PRIMARY triage signal. The legacy
// keyword scan below is secondary/advisory — it still drives category
// labeling (refill vs scheduling vs labs), but it can no longer escalate
// to urgent/adverse on its own, because bare substring hits are exactly
// what caused the EMR-1090 over-triage ("no chest pain" → urgent;
// "my daughter had a rash" → adverse).

import {
  triageMessage,
  type TriageDecision,
  type UpiPatientContext,
} from "@/lib/triage/upi";

export type MessagePriority = "urgent" | "high" | "routine" | "low";
export type MessageCategory =
  | "symptom_report"
  | "medication_question"
  | "refill_request"
  | "appointment_request"
  | "lab_question"
  | "adverse_reaction"
  | "administrative"
  | "follow_up"
  | "general";

export interface TriagedMessage {
  threadId: string;
  subject: string;
  patientName: string;
  patientId: string;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;

  // AI triage fields
  priority: MessagePriority;
  category: MessageCategory;
  /** Short AI-generated summary of the thread */
  summary: string;
  /** Why the AI assigned this priority/category */
  triageReason: string;
  /** Suggested quick-reply action */
  suggestedAction?: string;
  /** Whether the message needs clinician (vs admin) attention */
  needsClinician: boolean;
  /** EMR-659 — count of attachment-like artifacts detected across the thread.
   *  Zero means no paperclip is shown on the thread list row. */
  attachmentCount?: number;
}

// ── Triage rules (deterministic, no LLM needed) ────────

const URGENT_KEYWORDS = [
  "emergency",
  "chest pain",
  "can't breathe",
  "breathing problem",
  "suicidal",
  "overdose",
  "seizure",
  "unconscious",
  "severe reaction",
  "anaphyl",
  "911",
  "ER ",
  "emergency room",
  "vomiting blood",
  "severe pain",
  "can't stop",
  "hallucin",
];

const ADVERSE_KEYWORDS = [
  "side effect",
  "adverse",
  "reaction",
  "rash",
  "hives",
  "swelling",
  "dizzy",
  "vomiting",
  "nausea",
  "panic attack",
  "paranoia",
  "rapid heart",
  "palpitation",
  "fainted",
  "fell",
  "allergic",
];

const REFILL_KEYWORDS = [
  "refill",
  "renewal",
  "renew",
  "ran out",
  "running low",
  "need more",
  "prescription",
  "reorder",
  "re-order",
];

const MED_QUESTION_KEYWORDS = [
  "dosing",
  "dose",
  "how much",
  "how often",
  "when to take",
  "interaction",
  "can I take",
  "safe to",
  "with food",
  "timing",
  "milligram",
  "mg",
  "strain",
  "switch",
  "increase",
  "decrease",
];

const APPOINTMENT_KEYWORDS = [
  "appointment",
  "schedule",
  "reschedule",
  "cancel",
  "book",
  "visit",
  "come in",
  "see the doctor",
  "follow up",
  "follow-up",
  "next visit",
];

const LAB_KEYWORDS = [
  "lab",
  "blood work",
  "blood test",
  "results",
  "test results",
  "bloodwork",
  "cholesterol",
  "A1C",
  "liver",
  "kidney",
];

export interface ThreadTriageResult {
  priority: MessagePriority;
  category: MessageCategory;
  triageReason: string;
  needsClinician: boolean;
  suggestedAction?: string;
  /** EMR-1146 — full UPI decision (score, factor breakdown, auto-reply). */
  upi?: TriageDecision;
}

/**
 * Deterministic triage of a message thread.
 *
 * EMR-1146/1147 — the Urgency Priority Index (UPI) engine is the primary
 * signal: it handles all urgent/adverse escalation with negation filtering,
 * subject attribution, distress scoring, and chart-context vulnerability.
 * The keyword scan below is secondary — it only labels non-escalated
 * categories (meds / refills / scheduling / labs). An optional LLM layer
 * may refine summaries but never overrides the deterministic route.
 *
 * `patientContext` (vulnerability flags from the chart) is optional —
 * list surfaces that don't have chart data simply score with V_patient=0.
 */
export function triageThread(
  messages: { body: string; senderUserId: string | null; senderAgent: string | null; createdAt: string }[],
  patientUserId: string | null,
  patientContext?: UpiPatientContext,
): ThreadTriageResult {
  // Focus on the most recent patient messages
  const patientMessages = messages
    .filter((m) => m.senderUserId === patientUserId || (!m.senderUserId && !m.senderAgent))
    .slice(0, 5);

  const rawText = patientMessages.map((m) => m.body).join(". ");
  const allText = rawText.toLowerCase();

  // ── PRIMARY: deterministic UPI engine (EMR-1146, fixes EMR-1090) ──
  const upi = triageMessage(rawText, patientContext);

  if (upi.route === "urgent") {
    return {
      priority: "urgent",
      category: "adverse_reaction",
      triageReason:
        `UPI ${upi.upi.toFixed(2)} ≥ 0.75 — ` +
        describeUpiFactors(upi) +
        " Immediate clinician review needed.",
      needsClinician: true,
      suggestedAction: "Call patient immediately",
      upi,
    };
  }

  // Active first-party clinical entity at mid-tier acuity → high.
  const maxActiveAcuity = upi.factors.acuity.value;
  if (maxActiveAcuity >= 0.5) {
    const adverseKeywordHit = ADVERSE_KEYWORDS.some((kw) =>
      allText.includes(kw.toLowerCase()),
    );
    return {
      priority: "high",
      category: adverseKeywordHit ? "adverse_reaction" : "symptom_report",
      triageReason:
        `UPI ${upi.upi.toFixed(2)} — ` +
        describeUpiFactors(upi) +
        " Same-day clinician review recommended.",
      needsClinician: true,
      suggestedAction: "Review symptoms and adjust treatment if needed",
      upi,
    };
  }

  // ── SECONDARY (advisory): legacy keyword scan ──
  // Keyword hits that the UPI engine suppressed (negated / third-party /
  // resolved) are surfaced in the reason for transparency, but they do
  // NOT escalate — that substring behavior caused EMR-1090's over-triage.
  const suppressedNote = buildSuppressedKeywordNote(allText, upi);
  const finish = (result: ThreadTriageResult): ThreadTriageResult => ({
    ...result,
    triageReason: suppressedNote
      ? `${result.triageReason} ${suppressedNote}`
      : result.triageReason,
    upi,
  });

  // Medication questions
  if (MED_QUESTION_KEYWORDS.some((kw) => allText.includes(kw.toLowerCase()))) {
    return finish({
      priority: "high",
      category: "medication_question",
      triageReason: "Patient has questions about medication or dosing.",
      needsClinician: true,
      suggestedAction: "Review dosing and provide guidance",
    });
  }

  // Refill requests
  if (REFILL_KEYWORDS.some((kw) => allText.includes(kw.toLowerCase()))) {
    return finish({
      priority: "routine",
      category: "refill_request",
      triageReason: "Patient is requesting a medication refill or renewal.",
      needsClinician: false,
      suggestedAction: "Process refill request",
    });
  }

  // Appointment requests
  if (APPOINTMENT_KEYWORDS.some((kw) => allText.includes(kw.toLowerCase()))) {
    return finish({
      priority: "routine",
      category: "appointment_request",
      triageReason: "Patient is requesting scheduling assistance.",
      needsClinician: false,
      suggestedAction: "Schedule or confirm appointment",
    });
  }

  // Lab questions
  if (LAB_KEYWORDS.some((kw) => allText.includes(kw.toLowerCase()))) {
    return finish({
      priority: "routine",
      category: "lab_question",
      triageReason: "Patient has questions about lab results or tests.",
      needsClinician: true,
    });
  }

  // Symptom reports (generic / minor active entities)
  const symptomWords = ["pain", "hurt", "ache", "trouble", "worse", "better", "improve", "sleep", "anxiety", "nausea"];
  if (
    upi.factors.acuity.entities.some((e) => e.acuityClass === "minor" && !e.negated && !e.thirdParty) ||
    symptomWords.some((kw) => allText.includes(kw))
  ) {
    return finish({
      priority: "routine",
      category: "symptom_report",
      triageReason: "Patient is reporting symptoms or treatment response.",
      needsClinician: true,
    });
  }

  // Default: general/low priority
  return finish({
    priority: "low",
    category: "general",
    triageReason: "General message — no urgent or clinical keywords detected.",
    needsClinician: false,
  });
}

// ── UPI transparency helpers (EMR-1146) ────────────────────────────────

/** One-line plain-language factor summary for the triage reason tooltip. */
function describeUpiFactors(decision: TriageDecision): string {
  const f = decision.factors;
  const parts: string[] = [];
  const active = f.acuity.entities.filter((e) => !e.negated && !e.thirdParty && e.acuityClass !== "admin");
  if (active.length > 0) {
    parts.push(`symptoms: ${active.map((e) => e.label).join(", ")}`);
  }
  if (f.distress.value >= 0.25) {
    parts.push(`elevated distress (${f.distress.value.toFixed(2)})`);
  }
  if (f.vulnerability.activeFlags.length > 0) {
    parts.push(`vulnerable patient (${f.vulnerability.activeFlags.join(", ")})`);
  }
  if (f.redFlagFloorApplied) {
    parts.push("red-flag safety floor applied");
  }
  return parts.length > 0 ? `${parts.join("; ")}.` : "no individual factor dominated.";
}

/**
 * Advisory note when legacy urgent/adverse keywords matched but the UPI
 * engine suppressed them (negation, third-party attribution, resolution).
 * Surfaced in the triage reason so clinicians see WHY the thread is not
 * red — the durable fix for EMR-1090's over-triage half.
 */
function buildSuppressedKeywordNote(allText: string, decision: TriageDecision): string | null {
  const legacyHit =
    URGENT_KEYWORDS.some((kw) => allText.includes(kw.toLowerCase())) ||
    ADVERSE_KEYWORDS.some((kw) => allText.includes(kw.toLowerCase()));
  if (!legacyHit) return null;

  const suppressed = decision.factors.acuity.entities.filter(
    (e) => e.acuityClass !== "admin" && (e.negated || e.thirdParty),
  );
  if (suppressed.length === 0) return null;

  const detail = suppressed
    .map((e) => `${e.label.toLowerCase()} (${e.negated ? "negated" : "third-party"})`)
    .join(", ");
  return `(Keyword match suppressed by UPI assertion analysis: ${detail}.)`;
}

// ── Priority display helpers ───────────────────────────

export const PRIORITY_CONFIG: Record<MessagePriority, { label: string; color: string; bgColor: string }> = {
  urgent: { label: "Urgent", color: "text-red-700", bgColor: "bg-red-50" },
  high: { label: "High", color: "text-amber-700", bgColor: "bg-amber-50" },
  routine: { label: "Routine", color: "text-blue-700", bgColor: "bg-blue-50" },
  low: { label: "Low", color: "text-text-muted", bgColor: "bg-surface-muted" },
};

export const CATEGORY_LABELS: Record<MessageCategory, string> = {
  symptom_report: "Symptom Report",
  medication_question: "Medication Question",
  refill_request: "Refill Request",
  appointment_request: "Scheduling",
  lab_question: "Lab Results",
  adverse_reaction: "Adverse Reaction",
  administrative: "Administrative",
  follow_up: "Follow-up",
  general: "General",
};
