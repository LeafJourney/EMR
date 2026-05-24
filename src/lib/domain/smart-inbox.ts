// Smart Inbox domain types — EMR-153
// AI-triaged message queue for clinicians.

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

/**
 * Deterministic triage of a message thread based on keyword analysis.
 * This runs without an LLM — fast, cheap, predictable.
 * An optional AI layer can refine these results.
 */
export function triageThread(
  messages: { body: string; senderUserId: string | null; senderAgent: string | null; createdAt: string }[],
  patientUserId: string | null
): { priority: MessagePriority; category: MessageCategory; triageReason: string; needsClinician: boolean; suggestedAction?: string } {
  // Focus on the most recent patient messages
  const patientMessages = messages
    .filter((m) => m.senderUserId === patientUserId || (!m.senderUserId && !m.senderAgent))
    .slice(0, 5);

  const allText = patientMessages.map((m) => m.body).join(" ").toLowerCase();

  // Check urgent first
  if (URGENT_KEYWORDS.some((kw) => allText.includes(kw.toLowerCase()))) {
    return {
      priority: "urgent",
      category: "adverse_reaction",
      triageReason: "Message contains urgent/safety keywords. Immediate clinician review needed.",
      needsClinician: true,
      suggestedAction: "Call patient immediately",
    };
  }

  // Adverse reaction
  if (ADVERSE_KEYWORDS.some((kw) => allText.includes(kw.toLowerCase()))) {
    return {
      priority: "high",
      category: "adverse_reaction",
      triageReason: "Patient reports possible adverse reaction or side effect.",
      needsClinician: true,
      suggestedAction: "Review symptoms and adjust treatment if needed",
    };
  }

  // Medication questions
  if (MED_QUESTION_KEYWORDS.some((kw) => allText.includes(kw.toLowerCase()))) {
    return {
      priority: "high",
      category: "medication_question",
      triageReason: "Patient has questions about medication or dosing.",
      needsClinician: true,
      suggestedAction: "Review dosing and provide guidance",
    };
  }

  // Refill requests
  if (REFILL_KEYWORDS.some((kw) => allText.includes(kw.toLowerCase()))) {
    return {
      priority: "routine",
      category: "refill_request",
      triageReason: "Patient is requesting a medication refill or renewal.",
      needsClinician: false,
      suggestedAction: "Process refill request",
    };
  }

  // Appointment requests
  if (APPOINTMENT_KEYWORDS.some((kw) => allText.includes(kw.toLowerCase()))) {
    return {
      priority: "routine",
      category: "appointment_request",
      triageReason: "Patient is requesting scheduling assistance.",
      needsClinician: false,
      suggestedAction: "Schedule or confirm appointment",
    };
  }

  // Lab questions
  if (LAB_KEYWORDS.some((kw) => allText.includes(kw.toLowerCase()))) {
    return {
      priority: "routine",
      category: "lab_question",
      triageReason: "Patient has questions about lab results or tests.",
      needsClinician: true,
    };
  }

  // Symptom reports (generic)
  const symptomWords = ["pain", "hurt", "ache", "trouble", "worse", "better", "improve", "sleep", "anxiety", "nausea"];
  if (symptomWords.some((kw) => allText.includes(kw))) {
    return {
      priority: "routine",
      category: "symptom_report",
      triageReason: "Patient is reporting symptoms or treatment response.",
      needsClinician: true,
    };
  }

  // Default: general/low priority
  return {
    priority: "low",
    category: "general",
    triageReason: "General message — no urgent or clinical keywords detected.",
    needsClinician: false,
  };
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
