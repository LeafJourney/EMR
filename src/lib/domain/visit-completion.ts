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
  /**
   * Optional deep-link target. When set, activating the action navigates
   * (e.g. "#coding-suggestions" jumps to the note's coding section) instead
   * of opening the generic details drawer.
   */
  href?: string;
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
  /** EMR-1097 physician decision: suggested, approved, modified, dismissed. */
  status?: string | null;
  approvedByName?: string | null;
  approvedAt?: Date | string | null;
  approvedIcd10?: { code: string; label?: string }[] | null;
  approvedEmLevel?: string | null;
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
  // EMR-1100 (M5): this card renders the REAL coding state from the
  // CodingSuggestion the Coding Readiness Agent attached to the note — no
  // placeholder copy. The "Review coding" action deep-links to the note's
  // coding section where the physician approves the codes (EMR-1097).
  const items: VisitCompletionItem[] = [];

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
    const approved =
      codingSuggestion.status === "approved" || codingSuggestion.status === "modified";
    const suggestedCount = codingSuggestion.icd10.length;

    if (approved) {
      const approvedDetail = [
        codingSuggestion.approvedByName
          ? `Approved by ${codingSuggestion.approvedByName}`
          : "Approved by the physician",
        codingSuggestion.approvedAt
          ? `on ${new Date(codingSuggestion.approvedAt).toLocaleDateString("en-US")}`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      items.push(
        item(
          "coding-approval-status",
          "Codes approved ✓",
          "neutral",
          "coding",
          "agent_output",
          "coding_review",
          `${approvedDetail}. Charges are extracted from the approved codes.`,
        ),
      );
    } else {
      items.push(
        item(
          "coding-approval-status",
          `Coding review needed — ${suggestedCount} suggested ${
            suggestedCount === 1 ? "code" : "codes"
          } awaiting approval`,
          "warning",
          "coding",
          "agent_output",
          "coding_review",
          "No charges are created until the physician approves the suggested codes.",
        ),
      );
    }

    const emLevel = approved
      ? codingSuggestion.approvedEmLevel ?? codingSuggestion.emLevel
      : codingSuggestion.emLevel;
    if (emLevel) {
      items.push(
        item(
          "em-level",
          `${approved ? "Approved" : "Suggested"} E/M: ${emLevel}`,
          "neutral",
          "coding",
          "agent_output",
          "coding_review",
        ),
      );
    }

    const displayCodes =
      approved && codingSuggestion.approvedIcd10 && codingSuggestion.approvedIcd10.length > 0
        ? codingSuggestion.approvedIcd10
        : codingSuggestion.icd10;
    for (const candidate of displayCodes.slice(0, 4)) {
      items.push(
        item(
          `icd10-${candidate.code}`,
          `${approved ? "ICD-10 approved" : "ICD-10 candidate"}: ${candidate.code} ${
            candidate.label ?? ""
          }`.trim(),
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
      // Deep-link to the coding section of the note (EMR-1097 approval UI).
      action("review_coding", "Review coding", "secondary", "coding_review", "#coding-suggestions"),
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

// Per-action description (used as the button's accessible name + tooltip).
// Previously every action shared ONE generic string, so a screen reader could
// not tell Approve from Remove — the highest-stakes control in the product.
const ACTION_DISPOSITION_COPY: Record<VisitCompletionProposedActionType, string> = {
  order_review: "Stage this order for review. Nothing is ordered until you Release Care Plan.",
  approve:
    "Stage this card as approved. You still confirm it before Release Care Plan finalizes anything.",
  remove: "Remove this card from the release — it will not be acted on.",
  edit: "Edit this card's details before confirming.",
  defer: "Defer this card for later without rejecting it.",
  send_to_staff: "Stage a front-desk hand-off — created only when you Release Care Plan.",
  send_to_patient: "Stage a patient message — sent only when you Release Care Plan.",
  text_scheduling_link: "Stage a scheduling-link text — sent only when you Release Care Plan.",
  print: "Stage a printout — generated only when you Release Care Plan.",
  coding_review: "Stage coding for review. Nothing is submitted until you Release Care Plan.",
  create_staff_task: "Stage a staff task — created only when you Release Care Plan.",
  view_checks: "View the safety checks behind this card.",
};

function action(
  id: string,
  label: string,
  variant: VisitCompletionAction["variant"],
  proposedActionType: VisitCompletionProposedActionType,
  href?: string,
): VisitCompletionAction {
  return {
    id,
    label,
    variant,
    proposedActionType,
    requiresPhysicianApproval: true,
    sideEffect: "none",
    placeholderCopy:
      ACTION_DISPOSITION_COPY[proposedActionType] ??
      "Physician review required. This control stages the card disposition; Release Care Plan is the only action that creates reviewed tasks, drafts, and audit records.",
    ...(href ? { href } : {}),
  };
}
