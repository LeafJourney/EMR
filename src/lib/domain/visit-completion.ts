export type VisitCompletionCardId =
  | "orders"
  | "follow_up"
  | "patient_message"
  | "practice_readiness";
export type VisitCompletionTone = "neutral" | "warning" | "alert";
export type VisitCompletionSource =
  | "note"
  | "coding"
  | "problem_list"
  | "encounter"
  | "heuristic";
export type VisitCompletionDataMode =
  | "mvp_mock"
  | "deterministic_heuristic"
  | "agent_output";
export type VisitCompletionStatus = "suggested" | "needs_review" | "unavailable";
export type VisitCompletionProposedActionType =
  | "order_review"
  | "approve"
  | "remove"
  | "edit"
  | "defer"
  | "send_to_staff"
  | "send_to_patient"
  | "text_scheduling_link"
  | "print"
  | "coding_review"
  | "create_staff_task"
  | "view_checks";

export interface VisitCompletionItem {
  id: string;
  label: string;
  tone: VisitCompletionTone;
  source: VisitCompletionSource;
  dataMode: VisitCompletionDataMode;
  status: VisitCompletionStatus;
  proposedActionType: VisitCompletionProposedActionType;
  requiresPhysicianApproval: true;
  confidence?: number;
  reason?: string;
}

export interface VisitCompletionAction {
  id: string;
  label: string;
  variant: "primary" | "secondary";
  proposedActionType: VisitCompletionProposedActionType;
  requiresPhysicianApproval: true;
  sideEffect: "none";
  placeholderCopy: string;
}

export interface VisitCompletionCard {
  id: VisitCompletionCardId;
  title: string;
  subtitle: string;
  items: VisitCompletionItem[];
  actions: VisitCompletionAction[];
}

export interface VisitCompletionLearningSignal {
  actionId:
    | "release_care_plan"
    | "approve_all"
    | "edit_item"
    | "remove_item"
    | "defer_item";
  feedbackAction: "approved" | "approved_with_edits" | "rejected" | "dismissed";
  meaning: string;
}

export interface VisitCompletionLearningLoop {
  agentName: "visitCompletion";
  agentVersion: "1.0.0";
  signals: VisitCompletionLearningSignal[];
}

export interface VisitCompletionBundle {
  sectionLabel: "AI Visit Completion";
  strategyLabel: "Suggested Next Best Actions";
  heading: "Suggested next actions before sign-off";
  primaryActionLabel: "Release Care Plan";
  selectionLabel: "Select Care Actions";
  safetyCopy: "Nothing is ordered, sent, billed, scheduled, or assigned until the physician releases the care plan.";
  mockedDataNotice: string;
  summary: string;
  releaseEnabled: boolean;
  learningLoop: VisitCompletionLearningLoop;
  cards: VisitCompletionCard[];
}

export interface VisitCompletionCodingSuggestion {
  icd10: { code: string; label: string; confidence?: number }[];
  emLevel: string | null;
  rationale?: string | null;
}

export interface VisitCompletionBlock {
  heading: string;
  body: string;
}

export interface BuildVisitCompletionBundleInput {
  patientFirstName: string;
  blocks: VisitCompletionBlock[];
  codingSuggestion: VisitCompletionCodingSuggestion | null;
  hasFutureAppointment: boolean;
}

const learningLoop: VisitCompletionLearningLoop = {
  agentName: "visitCompletion",
  agentVersion: "1.0.0",
  signals: [
    {
      actionId: "release_care_plan",
      feedbackAction: "approved",
      meaning: "Physician released the generated visit-completion bundle.",
    },
    {
      actionId: "approve_all",
      feedbackAction: "approved",
      meaning: "Physician accepted the suggested actions without item-level edits.",
    },
    {
      actionId: "edit_item",
      feedbackAction: "approved_with_edits",
      meaning: "Physician kept the suggestion but changed clinical or operational details.",
    },
    {
      actionId: "remove_item",
      feedbackAction: "rejected",
      meaning: "Physician removed a suggested action as inappropriate for this visit.",
    },
    {
      actionId: "defer_item",
      feedbackAction: "dismissed",
      meaning: "Physician deferred a suggested action without rejecting the concept.",
    },
  ],
};

export function buildVisitCompletionBundle(
  input: BuildVisitCompletionBundleInput,
): VisitCompletionBundle {
  const text = noteText(input.blocks);
  const cards: VisitCompletionCard[] = [
    buildOrdersCard(text),
    buildFollowUpCard(text, input.hasFutureAppointment),
    buildPatientMessageCard(input.patientFirstName, text),
    buildPracticeReadinessCard(input.codingSuggestion),
  ];

  return {
    sectionLabel: "AI Visit Completion",
    strategyLabel: "Suggested Next Best Actions",
    heading: "Suggested next actions before sign-off",
    primaryActionLabel: "Release Care Plan",
    selectionLabel: "Select Care Actions",
    safetyCopy:
      "Nothing is ordered, sent, billed, scheduled, or assigned until the physician releases the care plan.",
    mockedDataNotice:
      "Draft suggestions only. Release creates reviewed staff tasks, draft patient communication, and an audit record; it does not place orders, send messages, submit billing, book appointments, or overwrite chart data.",
    summary: buildSummary(cards),
    releaseEnabled: cards.some((card) => card.items.length > 0),
    learningLoop,
    cards,
  };
}

function noteText(blocks: VisitCompletionBlock[]): string {
  return blocks
    .map((block) => `${block.heading}\n${block.body}`)
    .join("\n\n")
    .toLowerCase();
}

function buildOrdersCard(text: string): VisitCompletionCard {
  const diabetes = /\b(diabetes|diabetic|a1c|hba1c|glycemic)\b/.test(text);
  const medication = /\b(medication|med|dose|dosing|refill|regimen|prescribed)\b/.test(text);
  const pain = /\b(pain|arthritis|arthritic|somnolence|cbd|topical)\b/.test(text);

  const items: VisitCompletionItem[] = diabetes
    ? [
        item("a1c-due", "A1C", "neutral", "heuristic", "mvp_mock", "order_review"),
        item(
          "urine-albumin",
          "Urine albumin/creatinine",
          "neutral",
          "heuristic",
          "mvp_mock",
          "order_review",
        ),
        item("renal-metabolic", "CMP/eGFR", "neutral", "heuristic", "mvp_mock", "order_review"),
        item(
          "lipid-panel",
          "Lipid panel if due",
          "neutral",
          "heuristic",
          "mvp_mock",
          "order_review",
        ),
      ]
    : [
        item(
          "refill-check",
          medication ? "Medication refill check" : "Medication and regimen review",
          "neutral",
          "heuristic",
          "deterministic_heuristic",
          "order_review",
        ),
        item(
          "education-monitoring",
          pain
            ? "Monitor daytime somnolence after dose changes"
            : "Education or monitoring instruction from today’s plan",
          pain ? "warning" : "neutral",
          "note",
          "deterministic_heuristic",
          "order_review",
        ),
      ];

  return {
    id: "orders",
    title: "Suggested Orders",
    subtitle: "Based on today's assessment and active problems.",
    items,
    actions: [
      action("review_orders", "Review orders", "primary", "order_review"),
      action("approve_item", "Approve", "secondary", "approve"),
      action("remove_item", "Remove", "secondary", "remove"),
      action("edit_item", "Edit", "secondary", "edit"),
      action("defer_item", "Defer", "secondary", "defer"),
    ],
  };
}

function buildFollowUpCard(text: string, hasFutureAppointment: boolean): VisitCompletionCard {
  const mentionsFollowUp =
    /\b(return to clinic|rtc|follow[-\s]?up|next visit|recheck|see (?:you|patient) in)\b/.test(text) ||
    /\bin \d+\s*(?:day|days|week|weeks|month|months)\b/.test(text);
  const followUpInterval = text.match(/\bin\s+(\d+\s*(?:day|days|week|weeks|month|months))\b/)?.[1];

  const items: VisitCompletionItem[] = [];
  if (mentionsFollowUp && !hasFutureAppointment) {
    items.push(
      item(
        "follow-up-missing",
        followUpInterval
          ? `RTC in ${followUpInterval} recommended. No appointment currently scheduled.`
          : "Plan implies follow-up; no appointment scheduled.",
        "alert",
        "note",
        "deterministic_heuristic",
        "send_to_staff",
        "Follow-up language appears in the finalized plan.",
      ),
      item(
        "front-desk-scheduling",
        "Send scheduling task to front desk before patient leaves",
        "neutral",
        "heuristic",
        "deterministic_heuristic",
        "send_to_staff",
      ),
    );
  } else if (mentionsFollowUp) {
    items.push(
      item(
        "follow-up-scheduled",
        "Follow-up mentioned and appointment already scheduled",
        "neutral",
        "encounter",
        "deterministic_heuristic",
        "send_to_staff",
      ),
    );
  } else {
    items.push(
      item(
        "follow-up-review",
        "Confirm follow-up timing before releasing the care plan",
        "warning",
        "heuristic",
        "deterministic_heuristic",
        "edit",
      ),
    );
  }

  return {
    id: "follow_up",
    title: "Follow-Up Plan",
    subtitle: "Recommended next touchpoint and scheduling handoff.",
    items,
    actions: [
      action("send_to_front_desk", "Send to front desk", "primary", "send_to_staff"),
      action("text_scheduling_link", "Text scheduling link", "secondary", "text_scheduling_link"),
      action("edit_interval", "Edit interval", "secondary", "edit"),
      action("defer_item", "Defer", "secondary", "defer"),
    ],
  };
}

function buildPatientMessageCard(
  patientFirstName: string,
  text: string,
): VisitCompletionCard {
  const hasLabs = /\b(lab|labs|a1c|cmp|lipid|urine)\b/.test(text);
  const hasEducation = /\b(goal|education|instructions|monitor|treatment)\b/.test(text);
  const hasFollowUp = /\b(return to clinic|rtc|follow[-\s]?up|next visit|recheck)\b/.test(text);

  const items: VisitCompletionItem[] = [
    item(
      "portal-summary",
      hasLabs || hasFollowUp
        ? "Portal summary drafted with lab instructions and follow-up timing."
        : `Portal summary drafted for ${patientFirstName} with plain-language next steps.`,
      "neutral",
      "heuristic",
      "mvp_mock",
      "send_to_patient",
    ),
    item(
      "next-steps",
      hasLabs
        ? "Patient message includes lab instructions and follow-up timing"
        : "Patient message includes plain-language next steps",
      "neutral",
      "note",
      "deterministic_heuristic",
      "send_to_patient",
    ),
  ];

  if (hasEducation) {
    items.push(
      item(
        "education",
        "Education handoff ready for portal or print",
        "neutral",
        "heuristic",
        "deterministic_heuristic",
        "send_to_patient",
      ),
    );
  }

  return {
    id: "patient_message",
    title: "Patient Communication",
    subtitle: "Plain-language summary ready for portal or print.",
    items,
    actions: [
      action("preview_message", "Preview message", "primary", "send_to_patient"),
      action("edit_message", "Edit", "secondary", "edit"),
      action("send_to_portal", "Send to portal", "secondary", "send_to_patient"),
      action("print_summary", "Print", "secondary", "print"),
      action("defer_item", "Defer", "secondary", "defer"),
    ],
  };
}

function buildPracticeReadinessCard(
  codingSuggestion: VisitCompletionCodingSuggestion | null,
): VisitCompletionCard {
  const items: VisitCompletionItem[] = [
    item(
      "practice-readiness-overview",
      "Practice Readiness feedback: coding, documentation, prior auth, and staff routing checks.",
      "neutral",
      "heuristic",
      "mvp_mock",
      "view_checks",
      "AI summarizes operational checks here so the physician can release intent without doing back-office translation.",
    ),
    item(
      "documentation-gap",
      "Documentation gap: add medication risk discussion if dose changes proceed",
      "warning",
      "heuristic",
      "deterministic_heuristic",
      "coding_review",
      "This strengthens billing readiness and makes the clinical reasoning easier for staff to follow.",
    ),
    item(
      "staff-routing",
      "Staff task draft: confirm pharmacy and monitor prior-auth need before fulfillment",
      "neutral",
      "heuristic",
      "deterministic_heuristic",
      "create_staff_task",
      "This turns the physician's plan into a reviewable staff handoff without silently assigning work.",
    ),
  ];

  if (!codingSuggestion) {
    items.push(
      item(
        "coding-pending",
        "No coding suggestion yet",
        "warning",
        "coding",
        "deterministic_heuristic",
        "coding_review",
        "Coding Readiness Agent has not attached metadata to this note yet.",
      ),
    );
  } else {
    if (codingSuggestion.emLevel) {
      items.push(
        item(
          "em-level",
          `Suggested E/M: ${codingSuggestion.emLevel}`,
          "neutral",
          "coding",
          "agent_output",
          "coding_review",
        ),
      );
    }
    for (const candidate of codingSuggestion.icd10.slice(0, 2)) {
      items.push(
        item(
          `icd10-${candidate.code}`,
          `ICD-10 candidate: ${candidate.code} ${candidate.label}`,
          "neutral",
          "coding",
          "agent_output",
          "coding_review",
        ),
      );
    }
    if (codingSuggestion.rationale) {
      items.push(
        item(
          "coding-rationale",
          "Coding rationale available for review",
          "neutral",
          "coding",
          "agent_output",
          "coding_review",
          codingSuggestion.rationale,
        ),
      );
    }
  }

  return {
    id: "practice_readiness",
    title: "Practice Readiness",
    subtitle: "Coding, documentation, prior auth, billing readiness, and staff task checks.",
    items,
    actions: [
      action("view_checks", "View checks", "primary", "view_checks"),
      action("review_coding", "Review coding", "secondary", "coding_review"),
      action("create_staff_tasks", "Create staff tasks", "secondary", "create_staff_task"),
      action("defer_item", "Defer", "secondary", "defer"),
    ],
  };
}

function buildSummary(cards: VisitCompletionCard[]): string {
  const orders = cards.find((card) => card.id === "orders")?.items.length ?? 0;
  const followUpTasks = cards.find((card) => card.id === "follow_up")?.items.length ?? 0;
  const patientMessages =
    cards.find((card) => card.id === "patient_message")?.items.length ?? 0;

  return `Includes ${orders} care actions, ${patientMessages > 0 ? 1 : 0} patient message, ${followUpTasks} staff tasks, and billing readiness check.`;
}

function item(
  id: string,
  label: string,
  tone: VisitCompletionTone,
  source: VisitCompletionSource,
  dataMode: VisitCompletionDataMode,
  proposedActionType: VisitCompletionProposedActionType,
  reason?: string,
): VisitCompletionItem {
  return {
    id,
    label,
    tone,
    source,
    dataMode,
    status: tone === "alert" ? "needs_review" : "suggested",
    proposedActionType,
    requiresPhysicianApproval: true,
    confidence: dataMode === "agent_output" ? undefined : 0.72,
    reason,
  };
}

function action(
  id: string,
  label: string,
  variant: VisitCompletionAction["variant"],
  proposedActionType: VisitCompletionProposedActionType,
): VisitCompletionAction {
  return {
    id,
    label,
    variant,
    proposedActionType,
    requiresPhysicianApproval: true,
    sideEffect: "none",
    placeholderCopy:
      "Physician review required. This control stages the card disposition; Release Care Plan is the only action that creates reviewed tasks, drafts, and audit records.",
  };
}
