import type {
  VisitCompletionBundle,
  VisitCompletionCard,
  VisitCompletionCardId,
  VisitCompletionLearningSignal,
} from "./visit-completion";

export type VisitCompletionCardSelectionStatus =
  | "selected"
  | "approved"
  | "confirmed"
  | "edited"
  | "removed"
  | "deferred";

export interface VisitCompletionCardSelectionState {
  status: VisitCompletionCardSelectionStatus;
  editNote?: string;
  confirmationNote?: string;
  selectedItemIds?: string[];
  customLabels?: string[];
  structuredEdit?: VisitCompletionStructuredEdit;
}

export interface VisitCompletionStructuredEdit {
  selectedItemIds?: string[];
  customLabels?: string[];
  physicianNote?: string;
  followUpInterval?: string;
  followUpRouting?: "front_desk" | "scheduling_link" | "no_handoff" | "book_appointment";
  patientMessageDraft?: string;
  patientMessageChannel?: "portal" | "print" | "sms" | "translation";
  practiceReadinessOwner?: "back_office" | "front_office" | "clinician" | "billing";
}

export interface VisitCompletionSelectionState {
  cardStates: Record<VisitCompletionCardId, VisitCompletionCardSelectionState>;
}

export type VisitCompletionSelectionAction =
  | { type: "approve_card"; cardId: VisitCompletionCardId }
  | { type: "confirm_card"; cardId: VisitCompletionCardId; confirmationNote?: string }
  | { type: "remove_card"; cardId: VisitCompletionCardId }
  | { type: "defer_card"; cardId: VisitCompletionCardId }
  | {
      type: "edit_card";
      cardId: VisitCompletionCardId;
      note: string;
      selectedItemIds?: string[];
      customLabels?: string[];
      structuredEdit?: VisitCompletionStructuredEdit;
    };

export interface VisitCompletionReviewSection {
  cardId: VisitCompletionCardId;
  title: string;
  status: VisitCompletionCardSelectionStatus;
  labels: string[];
  editNote?: string;
  confirmationNote?: string;
  selectedItemIds?: string[];
  customLabels?: string[];
  structuredEdit?: VisitCompletionStructuredEdit;
}

export interface VisitCompletionReviewSignal {
  cardId: VisitCompletionCardId;
  feedbackAction: VisitCompletionLearningSignal["feedbackAction"];
  meaning: string;
}

export interface VisitCompletionReview {
  selectedSections: VisitCompletionReviewSection[];
  confirmedSections: VisitCompletionReviewSection[];
  needsConfirmationSections: VisitCompletionReviewSection[];
  removedSections: VisitCompletionReviewSection[];
  deferredSections: VisitCompletionReviewSection[];
  selectedLabels: string[];
  removedLabels: string[];
  deferredLabels: string[];
  selectedCount: number;
  totalCardCount: number;
  resolvedCardCount: number;
  needsConfirmationCount: number;
  removedCount: number;
  deferredCount: number;
  isReadyForRelease: boolean;
  feedbackSignals: VisitCompletionReviewSignal[];
  hasClinicalSideEffects: false;
  hasBillingSideEffects: false;
  hasPatientCommunicationSideEffects: false;
  hasStaffAssignmentSideEffects: false;
  hasChartWriteSideEffects: false;
}

export type VisitCompletionReleasePayloadStatus =
  | "blocked_needs_confirmation"
  | "ready_for_physician_release";

export type VisitCompletionReleaseDisposition =
  | "include"
  | "remove"
  | "hold_out"
  | "unresolved";

export interface VisitCompletionReleaseSection {
  cardId: VisitCompletionCardId;
  title: string;
  status: VisitCompletionCardSelectionStatus;
  disposition: VisitCompletionReleaseDisposition;
  labels: string[];
  editNote?: string;
  confirmationNote?: string;
  selectedItemIds?: string[];
  customLabels?: string[];
  structuredEdit?: VisitCompletionStructuredEdit;
  requiresPhysicianApproval: true;
}

export interface VisitCompletionReleaseAuditEvent {
  cardId: VisitCompletionCardId;
  eventType:
    | "visit_completion.card_needs_confirmation"
    | "visit_completion.card_confirmed"
    | "visit_completion.card_edited"
    | "visit_completion.card_removed"
    | "visit_completion.card_deferred";
  disposition: VisitCompletionReleaseDisposition;
  note?: string;
  requiresPhysicianApproval: true;
}

export interface VisitCompletionReleaseSummary {
  totalCards: number;
  includedCards: number;
  heldOutCards: number;
  unresolvedCards: number;
}

export interface VisitCompletionReleasePayload {
  version: "visit-completion-release/v1";
  releaseActionLabel: "Release Care Plan";
  mode: "review_only_mvp" | "physician_release_v1";
  status: VisitCompletionReleasePayloadStatus;
  canRelease: boolean;
  summary: VisitCompletionReleaseSummary;
  includedSections: VisitCompletionReleaseSection[];
  heldOutSections: VisitCompletionReleaseSection[];
  unresolvedSections: VisitCompletionReleaseSection[];
  blockingCardIds: VisitCompletionCardId[];
  auditEvents: VisitCompletionReleaseAuditEvent[];
  feedbackSignals: VisitCompletionReviewSignal[];
  safetyCopy: VisitCompletionBundle["safetyCopy"];
  sideEffects: {
    clinical: false;
    billing: false;
    patientCommunication: boolean;
    staffAssignment: boolean;
    chartWrite: false;
    scheduling: boolean;
  };
}

export function initializeVisitCompletionSelection(
  bundle: VisitCompletionBundle,
): VisitCompletionSelectionState {
  const cardStates = {} as VisitCompletionSelectionState["cardStates"];

  for (const card of bundle.cards) {
    cardStates[card.id] = { status: "selected" };
  }

  return { cardStates };
}

export function applyVisitCompletionAction(
  bundle: VisitCompletionBundle,
  state: VisitCompletionSelectionState,
  action: VisitCompletionSelectionAction,
): VisitCompletionSelectionState {
  if (!bundle.cards.some((card) => card.id === action.cardId)) {
    return state;
  }

  let nextCardState: VisitCompletionCardSelectionState;

  switch (action.type) {
    case "edit_card":
      nextCardState = {
        status: "edited",
        editNote: action.note.trim(),
        selectedItemIds: normalizeStringList(action.selectedItemIds),
        customLabels: normalizeStringList(action.customLabels),
        structuredEdit: normalizeStructuredEdit(action.structuredEdit),
      };
      break;
    case "confirm_card":
      nextCardState = {
        status: "confirmed",
        confirmationNote: action.confirmationNote?.trim() || undefined,
      };
      break;
    case "approve_card":
    case "remove_card":
    case "defer_card":
      nextCardState = { status: statusForAction(action.type) };
      break;
  }

  return {
    cardStates: {
      ...state.cardStates,
      [action.cardId]: nextCardState,
    },
  };
}

export function buildVisitCompletionReview(
  bundle: VisitCompletionBundle,
  state: VisitCompletionSelectionState,
): VisitCompletionReview {
  const sections = bundle.cards.map((card) => sectionForCard(card, state));
  const selectedSections = sections.filter((section) =>
    isSelectedForReleaseStatus(section.status),
  );
  const confirmedSections = sections.filter((section) => section.status === "confirmed");
  const needsConfirmationSections = sections.filter((section) =>
    isNeedsConfirmationStatus(section.status),
  );
  const removedSections = sections.filter((section) => section.status === "removed");
  const deferredSections = sections.filter((section) => section.status === "deferred");
  const resolvedCardCount = sections.filter((section) =>
    isResolvedCardStatus(section.status),
  ).length;

  return {
    selectedSections,
    confirmedSections,
    needsConfirmationSections,
    removedSections,
    deferredSections,
    selectedLabels: selectedSections.flatMap((section) => section.labels),
    removedLabels: removedSections.flatMap((section) => section.labels),
    deferredLabels: deferredSections.flatMap((section) => section.labels),
    selectedCount: countLabels(selectedSections),
    totalCardCount: sections.length,
    resolvedCardCount,
    needsConfirmationCount: needsConfirmationSections.length,
    removedCount: countLabels(removedSections),
    deferredCount: countLabels(deferredSections),
    isReadyForRelease: resolvedCardCount === sections.length,
    feedbackSignals: sections.map((section) => feedbackSignalForSection(section)),
    hasClinicalSideEffects: false,
    hasBillingSideEffects: false,
    hasPatientCommunicationSideEffects: false,
    hasStaffAssignmentSideEffects: false,
    hasChartWriteSideEffects: false,
  };
}

export function buildVisitCompletionReleasePayload(
  bundle: VisitCompletionBundle,
  state: VisitCompletionSelectionState,
): VisitCompletionReleasePayload {
  const review = buildVisitCompletionReview(bundle, state);
  const sections = bundle.cards.map((card) => releaseSectionForCard(card, state));
  const includedSections = sections.filter((section) => section.disposition === "include");
  const heldOutSections = sections.filter((section) =>
    ["remove", "hold_out"].includes(section.disposition),
  );
  const unresolvedSections = sections.filter((section) => section.disposition === "unresolved");
  const canRelease = unresolvedSections.length === 0;

  return {
    version: "visit-completion-release/v1",
    releaseActionLabel: "Release Care Plan",
    mode: "physician_release_v1",
    status: canRelease ? "ready_for_physician_release" : "blocked_needs_confirmation",
    canRelease,
    summary: {
      totalCards: sections.length,
      includedCards: includedSections.length,
      heldOutCards: heldOutSections.length,
      unresolvedCards: unresolvedSections.length,
    },
    includedSections,
    heldOutSections,
    unresolvedSections,
    blockingCardIds: unresolvedSections.map((section) => section.cardId),
    auditEvents: sections.map((section) => auditEventForSection(section)),
    feedbackSignals: review.feedbackSignals,
    safetyCopy: bundle.safetyCopy,
    sideEffects: releaseSideEffectsForSections(includedSections),
  };
}

function releaseSideEffectsForSections(
  includedSections: VisitCompletionReleaseSection[],
): VisitCompletionReleasePayload["sideEffects"] {
  const includedCardIds = new Set(includedSections.map((section) => section.cardId));
  const includesOrders = includedCardIds.has("orders");
  const includesFollowUp = includedCardIds.has("follow_up");
  const includesPatientMessage = includedCardIds.has("patient_message");

  return {
    clinical: false,
    billing: false,
    patientCommunication: includesPatientMessage,
    staffAssignment: includesOrders || includesFollowUp,
    chartWrite: false,
    scheduling: includesFollowUp,
  };
}

function statusForAction(
  type: Exclude<VisitCompletionSelectionAction["type"], "edit_card" | "confirm_card">,
): VisitCompletionCardSelectionStatus {
  switch (type) {
    case "approve_card":
      return "approved";
    case "remove_card":
      return "removed";
    case "defer_card":
      return "deferred";
  }
}

function sectionForCard(
  card: VisitCompletionCard,
  state: VisitCompletionSelectionState,
): VisitCompletionReviewSection {
  const cardState = state.cardStates[card.id] ?? { status: "selected" };

  return {
    cardId: card.id,
    title: card.title,
    status: cardState.status,
    labels: labelsForCard(card, cardState),
    editNote: cardState.editNote,
    confirmationNote: cardState.confirmationNote,
    selectedItemIds: cardState.selectedItemIds,
    customLabels: cardState.customLabels,
    structuredEdit: cardState.structuredEdit,
  };
}

function labelsForCard(
  card: VisitCompletionCard,
  cardState: VisitCompletionCardSelectionState,
): string[] {
  const selectedItemIds = cardState.selectedItemIds;
  const includedItemIds =
    selectedItemIds === undefined
      ? new Set(card.items.map((item) => item.id))
      : new Set(selectedItemIds);

  return [
    ...card.items.filter((item) => includedItemIds.has(item.id)).map((item) => item.label),
    ...(normalizeStringList(cardState.customLabels) ?? []),
  ];
}

function releaseSectionForCard(
  card: VisitCompletionCard,
  state: VisitCompletionSelectionState,
): VisitCompletionReleaseSection {
  const section = sectionForCard(card, state);

  return {
    ...section,
    disposition: dispositionForStatus(section.status),
    requiresPhysicianApproval: true,
  };
}

function dispositionForStatus(
  status: VisitCompletionCardSelectionStatus,
): VisitCompletionReleaseDisposition {
  switch (status) {
    case "confirmed":
    case "edited":
      return "include";
    case "removed":
      return "remove";
    case "deferred":
      return "hold_out";
    case "selected":
    case "approved":
      return "unresolved";
  }
}

function auditEventForSection(
  section: VisitCompletionReleaseSection,
): VisitCompletionReleaseAuditEvent {
  return {
    cardId: section.cardId,
    eventType: eventTypeForStatus(section.status),
    disposition: section.disposition,
    note: section.editNote ?? section.confirmationNote,
    requiresPhysicianApproval: true,
  };
}

function eventTypeForStatus(
  status: VisitCompletionCardSelectionStatus,
): VisitCompletionReleaseAuditEvent["eventType"] {
  switch (status) {
    case "confirmed":
      return "visit_completion.card_confirmed";
    case "edited":
      return "visit_completion.card_edited";
    case "removed":
      return "visit_completion.card_removed";
    case "deferred":
      return "visit_completion.card_deferred";
    case "selected":
    case "approved":
      return "visit_completion.card_needs_confirmation";
  }
}

function isSelectedForReleaseStatus(status: VisitCompletionCardSelectionStatus): boolean {
  return ["selected", "approved", "confirmed", "edited"].includes(status);
}

function isNeedsConfirmationStatus(status: VisitCompletionCardSelectionStatus): boolean {
  return ["selected", "approved"].includes(status);
}

function isResolvedCardStatus(status: VisitCompletionCardSelectionStatus): boolean {
  return ["confirmed", "edited", "removed", "deferred"].includes(status);
}

function countLabels(sections: VisitCompletionReviewSection[]): number {
  return sections.reduce((sum, section) => sum + section.labels.length, 0);
}

function normalizeStringList(values: string[] | undefined): string[] | undefined {
  if (!values) {
    return undefined;
  }

  const normalized = values.map((value) => value.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : [];
}

function normalizeStructuredEdit(
  structuredEdit: VisitCompletionStructuredEdit | undefined,
): VisitCompletionStructuredEdit | undefined {
  if (!structuredEdit) {
    return undefined;
  }

  const normalized: VisitCompletionStructuredEdit = {
    ...structuredEdit,
    selectedItemIds: normalizeStringList(structuredEdit.selectedItemIds),
    customLabels: normalizeStringList(structuredEdit.customLabels),
    physicianNote: structuredEdit.physicianNote?.trim() || undefined,
    followUpInterval: structuredEdit.followUpInterval?.trim() || undefined,
    patientMessageDraft: structuredEdit.patientMessageDraft?.trim() || undefined,
  };

  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== undefined),
  ) as VisitCompletionStructuredEdit;
}

function feedbackSignalForSection(
  section: VisitCompletionReviewSection,
): VisitCompletionReviewSignal {
  switch (section.status) {
    case "edited":
      return {
        cardId: section.cardId,
        feedbackAction: "approved_with_edits",
        meaning: "Physician kept the suggestion but changed details before release.",
      };
    case "removed":
      return {
        cardId: section.cardId,
        feedbackAction: "rejected",
        meaning: "Physician removed a suggested action as inappropriate for this visit.",
      };
    case "deferred":
      return {
        cardId: section.cardId,
        feedbackAction: "dismissed",
        meaning: "Physician deferred the suggestion without rejecting the concept.",
      };
    case "approved":
    case "confirmed":
    case "selected":
      return {
        cardId: section.cardId,
        feedbackAction: "approved",
        meaning: "Physician kept the suggested action in the release review.",
      };
  }
}
