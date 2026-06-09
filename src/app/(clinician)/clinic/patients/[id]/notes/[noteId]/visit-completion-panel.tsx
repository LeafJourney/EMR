"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ClipboardCheck,
  Clock3,
  Eye,
  FileCheck2,
  FileText,
  MessageSquareText,
  Pencil,
  Printer,
  Send,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type {
  VisitCompletionAction,
  VisitCompletionBundle,
  VisitCompletionCard,
  VisitCompletionCardId,
  VisitCompletionDataMode,
  VisitCompletionItem,
  VisitCompletionSource,
  VisitCompletionStatus,
  VisitCompletionTone,
} from "@/lib/domain/visit-completion";
import {
  applyVisitCompletionAction,
  buildVisitCompletionReleasePayload,
  buildVisitCompletionReview,
  initializeVisitCompletionSelection,
  type VisitCompletionCardSelectionStatus,
  type VisitCompletionReleasePayload,
  type VisitCompletionReview,
  type VisitCompletionSelectionAction,
  type VisitCompletionSelectionState,
  type VisitCompletionStructuredEdit,
} from "@/lib/domain/visit-completion-selection";
import { releaseVisitCompletion } from "./actions";

interface VisitCompletionPanelProps {
  bundle: VisitCompletionBundle;
  releasedPayload?: VisitCompletionReleasePayload | null;
  noteId: string;
}

const cardIcons: Record<VisitCompletionCardId, React.ComponentType<{ className?: string }>> = {
  orders: ClipboardCheck,
  follow_up: Clock3,
  patient_message: MessageSquareText,
  practice_readiness: ShieldCheck,
};

const actionIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  review_orders: Eye,
  approve_item: Check,
  remove_item: X,
  edit_item: Pencil,
  defer_item: Clock3,
  send_to_front_desk: UserRoundCheck,
  text_scheduling_link: Send,
  edit_interval: Pencil,
  preview_message: Eye,
  edit_message: Pencil,
  send_to_portal: Send,
  print_summary: Printer,
  view_checks: FileCheck2,
  review_coding: FileText,
  create_staff_tasks: UserRoundCheck,
};

const toneDot: Record<VisitCompletionTone, string> = {
  neutral: "bg-accent/70",
  warning: "bg-highlight",
  alert: "bg-danger",
};

const toneBadge: Record<VisitCompletionTone, "neutral" | "warning" | "danger"> = {
  neutral: "neutral",
  warning: "warning",
  alert: "danger",
};

const dataModeLabel: Record<VisitCompletionDataMode, string> = {
  mvp_mock: "Draft",
  deterministic_heuristic: "Heuristic",
  agent_output: "Agent",
};

const statusBadgeTone: Record<
  VisitCompletionCardSelectionStatus,
  "neutral" | "success" | "warning" | "danger" | "info"
> = {
  selected: "warning",
  approved: "warning",
  confirmed: "success",
  edited: "warning",
  removed: "danger",
  deferred: "neutral",
};

const statusLabel: Record<VisitCompletionCardSelectionStatus, string> = {
  selected: "Confirmation required",
  // Two-step: "Approve" stages the card; it only counts toward the
  // "N of N confirmations" progress once the card is also confirmed. Spell
  // that out so the two vocabularies don't read as a single done action.
  approved: "Approved — confirm to count",
  confirmed: "Confirmed",
  edited: "Edited; resolved",
  removed: "Removed",
  deferred: "Deferred",
};

const detailCopy: Record<
  VisitCompletionCardId,
  {
    instruction: string;
    question: string;
    confirmNote: string;
    releaseWillDo: string;
    releaseWillNotDo: string;
  }
> = {
  orders: {
    instruction: "Review proposed orders, screenings, and care-gap items before release.",
    question: "Are these suggested orders and care actions appropriate for this visit?",
    confirmNote: "Orders reviewed in the card detail panel.",
    releaseWillDo: "Creates a back-office task with reviewed order suggestions.",
    releaseWillNotDo: "Does not place clinical orders automatically.",
  },
  follow_up: {
    instruction: "Confirm interval, routing, scheduling handoff, and any patient link.",
    question: "Is this follow-up handoff clinically and operationally correct?",
    confirmNote: "Follow-up plan reviewed in the card detail panel.",
    releaseWillDo: "Creates a front-office scheduling task from the reviewed follow-up plan.",
    releaseWillNotDo: "Does not book an appointment or text the patient automatically.",
  },
  patient_message: {
    instruction: "Preview the patient-facing plan, channel, print needs, and translation needs.",
    question: "Is this communication ready to include in the care plan release review?",
    confirmNote: "Patient communication reviewed in the card detail panel.",
    releaseWillDo: "Creates an AI-drafted patient message in the patient thread.",
    releaseWillNotDo: "Does not send a portal message automatically.",
  },
  practice_readiness: {
    instruction: "Confirm coding, documentation, prior authorization, and staff-task checks.",
    question: "Are the practice readiness checks acceptable for release review?",
    confirmNote: "Practice readiness reviewed in the card detail panel.",
    releaseWillDo: "Stores readiness decisions with the release record for audit and follow-up.",
    releaseWillNotDo: "Does not submit billing or change coding automatically.",
  },
};

const itemSourceLabel: Record<VisitCompletionSource, string> = {
  note: "note",
  coding: "coding",
  problem_list: "problem list",
  encounter: "encounter",
  heuristic: "heuristic",
};

const itemStatusLabel: Record<VisitCompletionStatus, string> = {
  suggested: "Suggested",
  needs_review: "Needs review",
  unavailable: "Unavailable",
};

function isResolvedStatus(status: VisitCompletionCardSelectionStatus): boolean {
  return ["confirmed", "edited", "removed", "deferred"].includes(status);
}

function shouldOpenDetailsFromCardActivation(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return true;
  }

  return !target.closest(
    'button, a, input, textarea, select, summary, [role="button"], [role="link"]',
  );
}

type VisitCompletionDrawerMode = "review" | "edit";

interface VisitCompletionDrawerEditSubmission {
  note: string;
  selectedItemIds: string[];
  customLabels: string[];
  structuredEdit: VisitCompletionStructuredEdit;
}

function cardStateFromReleaseSection(
  section: VisitCompletionReleasePayload["includedSections"][number],
): VisitCompletionSelectionState["cardStates"][VisitCompletionCardId] {
  return {
    status: section.status,
    editNote: section.editNote,
    confirmationNote: section.confirmationNote,
    selectedItemIds: section.selectedItemIds,
    customLabels: section.customLabels,
    structuredEdit: section.structuredEdit,
  };
}

export function VisitCompletionPanel({
  bundle,
  releasedPayload,
  noteId,
}: VisitCompletionPanelProps) {
  const router = useRouter();
  const [localReleasedPayload, setLocalReleasedPayload] = React.useState<VisitCompletionReleasePayload | null>(
    releasedPayload ?? null
  );

  const [selectionState, setSelectionState] = React.useState<VisitCompletionSelectionState>(() => {
    if (releasedPayload) {
      const cardStates = {} as VisitCompletionSelectionState["cardStates"];
      for (const section of releasedPayload.includedSections) {
        cardStates[section.cardId] = cardStateFromReleaseSection(section);
      }
      for (const section of releasedPayload.heldOutSections) {
        cardStates[section.cardId] = cardStateFromReleaseSection(section);
      }
      for (const section of releasedPayload.unresolvedSections) {
        cardStates[section.cardId] = cardStateFromReleaseSection(section);
      }
      return { cardStates };
    }
    return initializeVisitCompletionSelection(bundle);
  });

  const [releaseReviewOpen, setReleaseReviewOpen] = React.useState(!releasedPayload);
  const [activeCardId, setActiveCardId] = React.useState<VisitCompletionCardId>(
    bundle.cards[0]?.id ?? "orders",
  );
  const [detailsDrawerOpen, setDetailsDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<VisitCompletionDrawerMode>("review");
  const [editingCardId, setEditingCardId] = React.useState<VisitCompletionCardId | null>(null);
  const [editDraft, setEditDraft] = React.useState("");
  const [releasePayloadOpen, setReleasePayloadOpen] = React.useState(!releasedPayload);

  const [isReleasing, startReleaseTransition] = React.useTransition();
  const [releaseError, setReleaseError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (releasedPayload) {
      setLocalReleasedPayload(releasedPayload);
      const cardStates = {} as VisitCompletionSelectionState["cardStates"];
      for (const section of releasedPayload.includedSections) {
        cardStates[section.cardId] = cardStateFromReleaseSection(section);
      }
      for (const section of releasedPayload.heldOutSections) {
        cardStates[section.cardId] = cardStateFromReleaseSection(section);
      }
      for (const section of releasedPayload.unresolvedSections) {
        cardStates[section.cardId] = cardStateFromReleaseSection(section);
      }
      setSelectionState({ cardStates });
      setReleaseReviewOpen(false);
      setReleasePayloadOpen(false);
      setDetailsDrawerOpen(false);
      setDrawerMode("review");
    }
  }, [releasedPayload]);

  const handleRelease = () => {
    setReleaseError(null);
    startReleaseTransition(async () => {
      try {
        const result = await releaseVisitCompletion(noteId, releasePayload);
        if (result.ok) {
          setLocalReleasedPayload(releasePayload);
          setReleasePayloadOpen(false);
          setReleaseReviewOpen(false);
          router.refresh();
        } else {
          setReleaseError(result.error);
        }
      } catch (err: any) {
        setReleaseError(err?.message || "An unexpected error occurred during release.");
      }
    });
  };

  const isReleased = Boolean(localReleasedPayload);

  const review = React.useMemo(
    () => buildVisitCompletionReview(bundle, selectionState),
    [bundle, selectionState],
  );
  const releasePayload = React.useMemo(
    () => buildVisitCompletionReleasePayload(bundle, selectionState),
    [bundle, selectionState],
  );

  const activeCard = bundle.cards.find((card) => card.id === activeCardId) ?? bundle.cards[0];
  const activeCardState =
    activeCard !== undefined
      ? (selectionState.cardStates[activeCard.id] ?? { status: "selected" })
      : undefined;

  function applyLocalAction(action: VisitCompletionSelectionAction) {
    setSelectionState((current) => applyVisitCompletionAction(bundle, current, action));
  }

  function openCardDetails(
    cardId: VisitCompletionCardId,
    mode: VisitCompletionDrawerMode = "review",
  ) {
    setActiveCardId(cardId);
    setDrawerMode(mode);
    setDetailsDrawerOpen(true);
    setReleaseReviewOpen(true);
  }

  function confirmCard(card: VisitCompletionCard) {
    applyLocalAction({
      type: "confirm_card",
      cardId: card.id,
      confirmationNote: detailCopy[card.id].confirmNote,
    });
    setDetailsDrawerOpen(false);
    setDrawerMode("review");
    setReleaseReviewOpen(true);
  }

  function handleCardAction(card: VisitCompletionCard, action: VisitCompletionAction) {
    setActiveCardId(card.id);
    setReleaseReviewOpen(true);

    switch (action.proposedActionType) {
      case "approve":
      case "send_to_staff":
      case "send_to_patient":
      case "text_scheduling_link":
      case "print":
      case "create_staff_task":
        applyLocalAction({ type: "approve_card", cardId: card.id });
        return;
      case "remove":
        applyLocalAction({ type: "remove_card", cardId: card.id });
        return;
      case "defer":
        applyLocalAction({ type: "defer_card", cardId: card.id });
        return;
      case "edit":
        setEditingCardId(null);
        setEditDraft("");
        openCardDetails(card.id, "edit");
        return;
      case "order_review":
      case "coding_review":
      case "view_checks":
        openCardDetails(card.id);
        return;
    }
  }

  function saveStructuredEdit(card: VisitCompletionCard, edit: VisitCompletionDrawerEditSubmission) {
    applyLocalAction({
      type: "edit_card",
      cardId: card.id,
      note: edit.note,
      selectedItemIds: edit.selectedItemIds,
      customLabels: edit.customLabels,
      structuredEdit: edit.structuredEdit,
    });
    setDrawerMode("review");
    setDetailsDrawerOpen(true);
    setReleaseReviewOpen(true);
  }

  function saveEdit(cardId: VisitCompletionCardId) {
    applyLocalAction({
      type: "edit_card",
      cardId,
      note: editDraft.trim() || "Edited locally before release.",
    });
    setEditingCardId(null);
    setEditDraft("");
    setReleaseReviewOpen(true);
  }

  return (
    <section
      aria-labelledby="ai-visit-completion-heading"
      className="mt-8 overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
    >
      <div className="border-b border-border/70 bg-surface-muted/60 px-5 py-5 lg:px-6">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              {bundle.sectionLabel}
            </p>
            <Badge tone="accent">{bundle.strategyLabel}</Badge>
          </div>
          <h2
            id="ai-visit-completion-heading"
            className="mt-2 font-display text-2xl font-semibold tracking-tight text-text md:text-3xl"
          >
            {bundle.heading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Based on the finalized note, active problems, patient history, and practice
            patterns. Review, approve, remove, edit, defer, or route the proposed work.
          </p>
          <p className="mt-2 text-sm font-medium leading-relaxed text-text">
            {bundle.safetyCopy}
          </p>
        </div>
      </div>

      <div className="border-b border-border/70 px-5 py-4 lg:px-6">
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              {bundle.selectionLabel}
            </p>
            <p className="mt-1 text-sm text-text-muted">{bundle.mockedDataNotice}</p>
          </div>
          <p className="text-sm font-medium text-text">{bundle.summary}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-4">
        {bundle.cards.map((card) => (
          <SuggestedActionCard
            key={card.id}
            card={card}
            cardState={selectionState.cardStates[card.id] ?? { status: "selected" }}
            isActive={activeCardId === card.id}
            isEditing={editingCardId === card.id}
            editDraft={editDraft}
            onEditDraftChange={setEditDraft}
            onSaveEdit={() => saveEdit(card.id)}
            onCancelEdit={() => {
              setEditingCardId(null);
              setEditDraft("");
            }}
            onOpenDetails={() => openCardDetails(card.id)}
            onAction={(action) => handleCardAction(card, action)}
            isReleased={isReleased}
          />
        ))}
      </div>

      {activeCard && activeCardState && (
        <VisitCompletionDetailsDrawer
          card={activeCard}
          cardState={activeCardState}
          isOpen={detailsDrawerOpen}
          mode={drawerMode}
          onClose={() => {
            setDetailsDrawerOpen(false);
            setDrawerMode("review");
          }}
          onConfirm={() => confirmCard(activeCard)}
          onEdit={() => {
            setActiveCardId(activeCard.id);
            setEditingCardId(null);
            setEditDraft("");
            setDrawerMode("edit");
          }}
          onSaveEdit={(edit) => saveStructuredEdit(activeCard, edit)}
          onCancelEdit={() => setDrawerMode("review")}
          onRemove={() => {
            setDetailsDrawerOpen(false);
            setDrawerMode("review");
            setActiveCardId(activeCard.id);
            applyLocalAction({ type: "remove_card", cardId: activeCard.id });
          }}
          onDefer={() => {
            setDetailsDrawerOpen(false);
            setDrawerMode("review");
            setActiveCardId(activeCard.id);
            applyLocalAction({ type: "defer_card", cardId: activeCard.id });
          }}
          isReleased={isReleased}
        />
      )}

      {releaseReviewOpen && (
        <VisitCompletionReviewPanel
          review={review}
          activeCard={activeCard}
          onSelectCard={(cardId) => setActiveCardId(cardId)}
        />
      )}

      <VisitCompletionProgressPanel
        cards={bundle.cards}
        review={review}
        isReleased={isReleased}
        onSelectCard={openCardDetails}
      />

      <FinalReleaseReviewPanel
        payload={releasePayload}
        isOpen={releasePayloadOpen}
        onToggle={() => setReleasePayloadOpen((open) => !open)}
        isReleasing={isReleasing}
        releaseError={releaseError}
        onRelease={handleRelease}
        isReleased={isReleased}
      />

      <div className="mx-5 mb-5 flex flex-col gap-3 rounded-lg border border-highlight/35 bg-highlight-soft px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-text">
            {isReleased ? "Care Plan released." : "Physician remains in control."}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            {isReleased
              ? "Audited physician actions have been durably saved and task handoffs are routed to queues."
              : "AI prepares the next actions; Release Care Plan creates only reviewed tasks, drafts, and audit records after physician approval."}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            {isReleased
              ? "No additional orders, messages, billing, scheduling, staffing, or chart writes can be triggered from this locked view."
              : "It does not place clinical orders, send patient messages, submit billing, book appointments, or overwrite chart data."}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            Learns from approvals, edits, removals, and deferrals.
          </p>
        </div>
        <Badge tone={isReleased ? "success" : "highlight"} className="shrink-0">
          {isReleased ? "Released" : "Physician release required"}
        </Badge>
      </div>
    </section>
  );
}

function SuggestedActionCard({
  card,
  cardState,
  isActive,
  isEditing,
  editDraft,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onOpenDetails,
  onAction,
  isReleased,
}: {
  card: VisitCompletionCard;
  cardState: VisitCompletionSelectionState["cardStates"][VisitCompletionCardId];
  isActive: boolean;
  isEditing: boolean;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onOpenDetails: () => void;
  onAction: (action: VisitCompletionAction) => void;
  isReleased: boolean;
}) {
  const Icon = cardIcons[card.id];
  const needsReview = card.items.some((item) => item.tone !== "neutral");
  const needsConfirmation = !isResolvedStatus(cardState.status);

  function handleCardClick(event: React.MouseEvent<HTMLElement>) {
    if (!shouldOpenDetailsFromCardActivation(event.target)) {
      return;
    }

    onOpenDetails();
  }

  function handleCardKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenDetails();
    }
  }

  return (
    <article
      role="group"
      tabIndex={0}
      aria-label={`Open ${card.title} details`}
      title={`Open ${card.title} details`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      className={cn(
        "flex min-h-[300px] cursor-pointer flex-col overflow-hidden rounded-lg border bg-surface transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        isActive && "border-accent/45 shadow-sm ring-1 ring-accent/15",
        cardState.status === "removed"
          ? "border-danger/30 bg-red-50/30"
          : cardState.status === "deferred"
            ? "border-border bg-surface-muted/40"
            : "border-border/80",
      )}
    >
      <div className="border-b border-border/60 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Icon className="h-4 w-4" />
            </span>
            <h3 className="text-base font-semibold text-text">{card.title}</h3>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge tone={statusBadgeTone[cardState.status]}>{statusLabel[cardState.status]}</Badge>
            {needsReview && (
              <Badge
                tone={card.items.some((item) => item.tone === "alert") ? "danger" : "warning"}
              >
                Review
              </Badge>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-text-muted">{card.subtitle}</p>
        {needsConfirmation && (
          <p className="mt-2 text-xs font-medium text-[color:var(--highlight-hover)]">
            Click in to confirm before release.
          </p>
        )}
      </div>

      <ul className="flex-1 space-y-3 px-4 py-4">
        {card.items.map((item) => (
          <VisitCompletionLine key={item.id} item={item} />
        ))}
      </ul>

      {cardState.editNote && (
        <p className="mx-4 mb-3 rounded-md border border-highlight/30 bg-highlight-soft px-3 py-2 text-xs leading-relaxed text-text-muted">
          Edit note: {cardState.editNote}
        </p>
      )}

      {isEditing && (
        <div className="mx-4 mb-3 rounded-md border border-accent/20 bg-accent-soft/50 px-3 py-3">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
            Edit proposed action
          </label>
          <textarea
            className="mt-2 min-h-20 w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            value={editDraft}
            onChange={(event) => onEditDraftChange(event.target.value)}
            placeholder="Add the physician-approved change before release."
          />
          <p className="mt-2 text-xs text-text-muted">Local review state only.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={onSaveEdit}>
              Save edit
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="border-t border-border/60 px-4 py-3">
        <Button
          size="sm"
          variant={isActive ? "secondary" : "ghost"}
          className={cn(
            "h-8 rounded-md px-2.5 text-xs",
            isActive && "border-accent/25 bg-accent-soft text-accent hover:bg-accent-soft",
          )}
          onClick={onOpenDetails}
          title={`Open ${card.title} details`}
          leadingIcon={<Eye className="h-3.5 w-3.5" />}
        >
          Open details
        </Button>
      </div>

      {!isReleased && <VisitCompletionActionList actions={card.actions} onAction={onAction} />}
    </article>
  );
}

export function VisitCompletionDetailsDrawer({
  card,
  cardState,
  isOpen = true,
  mode = "review",
  onClose,
  onConfirm,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onRemove,
  onDefer,
  isReleased,
}: {
  card: VisitCompletionCard;
  cardState: VisitCompletionSelectionState["cardStates"][VisitCompletionCardId];
  isOpen?: boolean;
  mode?: VisitCompletionDrawerMode;
  onClose: () => void;
  onConfirm: () => void;
  onEdit: () => void;
  onSaveEdit: (edit: VisitCompletionDrawerEditSubmission) => void;
  onCancelEdit: () => void;
  onRemove: () => void;
  onDefer: () => void;
  isReleased: boolean;
}) {
  const Icon = cardIcons[card.id];
  const copy = detailCopy[card.id];
  const resolved = isResolvedStatus(cardState.status);
  const isEditing = mode === "edit" && !isReleased;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/15">
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={`visit-completion-drawer-${card.id}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-surface shadow-2xl"
      >
        <div className="border-b border-border bg-surface-muted/60 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                    Review details drawer
                  </p>
                  <Badge tone={statusBadgeTone[cardState.status]}>
                    {statusLabel[cardState.status]}
                  </Badge>
                </div>
                <h3
                  id={`visit-completion-drawer-${card.id}`}
                  className="mt-1 text-lg font-semibold text-text"
                >
                  {isEditing ? `Edit ${card.title}` : `${card.title} confirmation`}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">
                  {isEditing
                    ? "Adjust the prepared action, keep only what belongs, then save it back into the release review."
                    : copy.instruction}
                </p>
              </div>
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              title="Close details"
              aria-label="Close details"
              leadingIcon={<X className="h-3.5 w-3.5" />}
            >
              Close details
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!isReleased && !isEditing && (
            <div className="mb-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={onConfirm}
                title="Confirm this card for release review"
                leadingIcon={<Check className="h-3.5 w-3.5" />}
              >
                Confirm this card
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onEdit}
                title="Edit this card locally before release"
                leadingIcon={<Pencil className="h-3.5 w-3.5" />}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onRemove}
                title="Remove this card from the release review"
                leadingIcon={<X className="h-3.5 w-3.5" />}
              >
                Remove
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDefer}
                title="Defer this card without rejecting the concept"
                leadingIcon={<Clock3 className="h-3.5 w-3.5" />}
              >
                Defer
              </Button>
            </div>
          )}

          {isEditing ? (
            <VisitCompletionStructuredEditForm
              card={card}
              cardState={cardState}
              onSave={onSaveEdit}
              onCancel={onCancelEdit}
            />
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-surface-muted/35 px-4 py-3">
                <p className="text-sm font-semibold text-text">{copy.question}</p>
                <ul className="mt-3 space-y-2">
                  {card.items.map((item) => (
                    <VisitCompletionDetailItem key={item.id} item={item} />
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-border bg-surface-muted/35 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
                  What release will do
                </p>
                <p className="mt-2 text-sm font-semibold text-text">{copy.releaseWillDo}</p>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">
                  {copy.releaseWillNotDo}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-surface-muted/35 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
                  Confirmation state
                </p>
                <p className="mt-2 text-sm font-semibold text-text">
                  {resolved
                    ? "Resolved for release review"
                    : "Confirmation required before release."}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">
                  Nothing is routed until the physician releases the care plan. Release creates only
                  the reviewed task, draft, and audit artifacts described above.
                </p>
                {cardState.confirmationNote && (
                  <p className="mt-3 rounded-md border border-accent/20 bg-accent-soft/45 px-3 py-2 text-xs leading-relaxed text-text-muted">
                    Confirmation note: {cardState.confirmationNote}
                  </p>
                )}
                {cardState.editNote && (
                  <p className="mt-3 rounded-md border border-highlight/30 bg-highlight-soft px-3 py-2 text-xs leading-relaxed text-text-muted">
                    Edit note: {cardState.editNote}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

interface VisitCompletionStructuredEditDraft {
  selectedItemIds: string[];
  customLabels: string[];
  customLabelDraft: string;
  physicianNote: string;
  followUpInterval: string;
  followUpRouting: NonNullable<VisitCompletionStructuredEdit["followUpRouting"]>;
  patientMessageDraft: string;
  patientMessageChannel: NonNullable<VisitCompletionStructuredEdit["patientMessageChannel"]>;
  practiceReadinessOwner: NonNullable<VisitCompletionStructuredEdit["practiceReadinessOwner"]>;
}

function VisitCompletionStructuredEditForm({
  card,
  cardState,
  onSave,
  onCancel,
}: {
  card: VisitCompletionCard;
  cardState: VisitCompletionSelectionState["cardStates"][VisitCompletionCardId];
  onSave: (edit: VisitCompletionDrawerEditSubmission) => void;
  onCancel: () => void;
}) {
  const initialDraft = React.useMemo(
    () => buildStructuredEditDraft(card, cardState),
    [card, cardState],
  );
  const [draft, setDraft] = React.useState(initialDraft);

  React.useEffect(() => {
    setDraft(buildStructuredEditDraft(card, cardState));
  }, [card, cardState]);

  function toggleItem(itemId: string) {
    setDraft((current) => {
      const selected = new Set(current.selectedItemIds);
      if (selected.has(itemId)) {
        selected.delete(itemId);
      } else {
        selected.add(itemId);
      }
      return { ...current, selectedItemIds: Array.from(selected) };
    });
  }

  function addCustomLabel() {
    const label = draft.customLabelDraft.trim();
    if (!label) return;
    setDraft((current) => ({
      ...current,
      customLabels: [...current.customLabels, label],
      customLabelDraft: "",
    }));
  }

  function removeCustomLabel(label: string) {
    setDraft((current) => ({
      ...current,
      customLabels: current.customLabels.filter((existing) => existing !== label),
    }));
  }

  const submission = buildStructuredEditSubmission(card, draft);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-accent/20 bg-accent-soft/35 px-4 py-3">
        <p className="text-sm font-semibold text-text">Included actions</p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          Keep the suggestions that belong in the release. Removed rows stay out of the released
          staff task, draft, or readiness record.
        </p>
        <div className="mt-3 space-y-2">
          {card.items.map((item) => (
            <label
              key={item.id}
              className="flex gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-text"
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
                checked={draft.selectedItemIds.includes(item.id)}
                onChange={() => toggleItem(item.id)}
              />
              <span>
                <span className="font-medium">{item.label}</span>
                {item.reason && (
                  <span className="mt-1 block text-xs text-text-subtle">{item.reason}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>

      {card.id === "follow_up" && (
        <div className="grid gap-3 rounded-lg border border-border bg-surface-muted/35 px-4 py-3 md:grid-cols-2">
          <label className="text-sm font-semibold text-text">
            Follow-up interval
            <input
              className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal text-text shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={draft.followUpInterval}
              onChange={(event) =>
                setDraft((current) => ({ ...current, followUpInterval: event.target.value }))
              }
              placeholder="6 weeks"
            />
          </label>
          <label className="text-sm font-semibold text-text">
            Scheduling handoff
            <select
              className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal text-text shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={draft.followUpRouting}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  followUpRouting: event.target.value as VisitCompletionStructuredEditDraft["followUpRouting"],
                }))
              }
            >
              <option value="front_desk">Front desk scheduling task</option>
              <option value="scheduling_link">Text scheduling link</option>
              <option value="no_handoff">No scheduling handoff</option>
            </select>
          </label>
        </div>
      )}

      {card.id === "patient_message" && (
        <div className="space-y-3 rounded-lg border border-border bg-surface-muted/35 px-4 py-3">
          <label className="text-sm font-semibold text-text">
            Message channel
            <select
              className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal text-text shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={draft.patientMessageChannel}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  patientMessageChannel:
                    event.target.value as VisitCompletionStructuredEditDraft["patientMessageChannel"],
                }))
              }
            >
              <option value="portal">Portal draft</option>
              <option value="print">Print summary</option>
              <option value="sms">SMS scheduling note</option>
              <option value="translation">Translation requested</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-text">
            Patient message draft
            <textarea
              className="mt-2 min-h-36 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal leading-relaxed text-text shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={draft.patientMessageDraft}
              onChange={(event) =>
                setDraft((current) => ({ ...current, patientMessageDraft: event.target.value }))
              }
            />
          </label>
        </div>
      )}

      {card.id === "practice_readiness" && (
        <div className="rounded-lg border border-border bg-surface-muted/35 px-4 py-3">
          <label className="text-sm font-semibold text-text">
            Practice readiness owner
            <select
              className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal text-text shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={draft.practiceReadinessOwner}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  practiceReadinessOwner:
                    event.target.value as VisitCompletionStructuredEditDraft["practiceReadinessOwner"],
                }))
              }
            >
              <option value="back_office">Back office</option>
              <option value="front_office">Front office</option>
              <option value="clinician">Clinician</option>
              <option value="billing">Billing</option>
            </select>
          </label>
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface-muted/35 px-4 py-3">
        <label className="text-sm font-semibold text-text">
          Add custom action
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal text-text shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={draft.customLabelDraft}
              onChange={(event) =>
                setDraft((current) => ({ ...current, customLabelDraft: event.target.value }))
              }
              placeholder="Add a reviewed action for staff or patient handoff"
            />
            <Button type="button" size="sm" variant="secondary" onClick={addCustomLabel}>
              Add
            </Button>
          </div>
        </label>
        {draft.customLabels.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {draft.customLabels.map((label) => (
              <button
                key={label}
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-muted hover:border-danger/40 hover:text-danger"
                onClick={() => removeCustomLabel(label)}
              >
                {label}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
      </div>

      {card.id !== "patient_message" && (
        <div className="rounded-lg border border-border bg-surface-muted/35 px-4 py-3">
          <label className="text-sm font-semibold text-text">
            Physician note
            <textarea
              className="mt-2 min-h-24 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal leading-relaxed text-text shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={draft.physicianNote}
              onChange={(event) =>
                setDraft((current) => ({ ...current, physicianNote: event.target.value }))
              }
              placeholder="Add the physician-approved change or rationale."
            />
          </label>
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-4 border-t border-border bg-surface/95 px-5 py-4 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel edit
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onSave(submission)}
            leadingIcon={<Check className="h-3.5 w-3.5" />}
          >
            Save and confirm
          </Button>
        </div>
      </div>
    </div>
  );
}

function buildStructuredEditDraft(
  card: VisitCompletionCard,
  cardState: VisitCompletionSelectionState["cardStates"][VisitCompletionCardId],
): VisitCompletionStructuredEditDraft {
  const structuredEdit = cardState.structuredEdit ?? {};

  return {
    selectedItemIds:
      structuredEdit.selectedItemIds ?? cardState.selectedItemIds ?? card.items.map((item) => item.id),
    customLabels: structuredEdit.customLabels ?? cardState.customLabels ?? [],
    customLabelDraft: "",
    physicianNote: structuredEdit.physicianNote ?? cardState.editNote ?? "",
    followUpInterval: structuredEdit.followUpInterval ?? inferFollowUpInterval(card),
    followUpRouting: structuredEdit.followUpRouting ?? "front_desk",
    patientMessageDraft:
      structuredEdit.patientMessageDraft ?? cardState.editNote ?? buildDefaultPatientMessage(card),
    patientMessageChannel: structuredEdit.patientMessageChannel ?? "portal",
    practiceReadinessOwner: structuredEdit.practiceReadinessOwner ?? "back_office",
  };
}

function buildStructuredEditSubmission(
  card: VisitCompletionCard,
  draft: VisitCompletionStructuredEditDraft,
): VisitCompletionDrawerEditSubmission {
  const customLabels = normalizeDrawerLabels([
    ...draft.customLabels,
    ...derivedStructuredLabels(card, draft),
    draft.customLabelDraft,
  ]);
  const selectedItemIds = draft.selectedItemIds.filter((itemId) =>
    card.items.some((item) => item.id === itemId),
  );
  const structuredEdit: VisitCompletionStructuredEdit = {
    selectedItemIds,
    customLabels,
    physicianNote: draft.physicianNote.trim() || undefined,
  };

  if (card.id === "follow_up") {
    structuredEdit.followUpInterval = draft.followUpInterval.trim() || undefined;
    structuredEdit.followUpRouting = draft.followUpRouting;
  }

  if (card.id === "patient_message") {
    structuredEdit.patientMessageDraft = draft.patientMessageDraft.trim() || undefined;
    structuredEdit.patientMessageChannel = draft.patientMessageChannel;
  }

  if (card.id === "practice_readiness") {
    structuredEdit.practiceReadinessOwner = draft.practiceReadinessOwner;
  }

  return {
    note: noteForStructuredEdit(card, draft),
    selectedItemIds,
    customLabels,
    structuredEdit,
  };
}

function derivedStructuredLabels(
  card: VisitCompletionCard,
  draft: VisitCompletionStructuredEditDraft,
): string[] {
  switch (card.id) {
    case "follow_up":
      return [
        draft.followUpInterval.trim() ? `Follow-up interval: ${draft.followUpInterval.trim()}` : "",
        `Scheduling handoff: ${followUpRoutingLabel[draft.followUpRouting]}`,
      ];
    case "patient_message":
      return [`Patient message channel: ${patientMessageChannelLabel[draft.patientMessageChannel]}`];
    case "practice_readiness":
      return [`Practice readiness owner: ${practiceReadinessOwnerLabel[draft.practiceReadinessOwner]}`];
    case "orders":
      return [];
  }
}

function noteForStructuredEdit(
  card: VisitCompletionCard,
  draft: VisitCompletionStructuredEditDraft,
): string {
  if (card.id === "patient_message") {
    return draft.patientMessageDraft.trim() || "Patient message edited before release.";
  }

  const physicianNote = draft.physicianNote.trim();
  if (physicianNote) {
    return physicianNote;
  }

  if (card.id === "follow_up") {
    return `Follow-up interval: ${draft.followUpInterval.trim() || "not specified"}; scheduling handoff: ${
      followUpRoutingLabel[draft.followUpRouting]
    }.`;
  }

  if (card.id === "practice_readiness") {
    return `Practice readiness owner: ${practiceReadinessOwnerLabel[draft.practiceReadinessOwner]}.`;
  }

  return "Structured edits reviewed and confirmed before release.";
}

function normalizeDrawerLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const label of labels) {
    const trimmed = label.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function inferFollowUpInterval(card: VisitCompletionCard): string {
  const labelText = card.items.map((item) => item.label).join(" ");
  return labelText.match(/\b(\d+\s*(?:day|days|week|weeks|month|months))\b/i)?.[1] ?? "6 weeks";
}

function buildDefaultPatientMessage(card: VisitCompletionCard): string {
  const nextSteps = card.items.map((item) => `- ${item.label}`).join("\n");
  return `Today we reviewed your care plan. Please review these next steps:\n\n${nextSteps}`;
}

const followUpRoutingLabel: Record<
  NonNullable<VisitCompletionStructuredEdit["followUpRouting"]>,
  string
> = {
  front_desk: "front desk scheduling task",
  scheduling_link: "text scheduling link",
  no_handoff: "no scheduling handoff",
};

const patientMessageChannelLabel: Record<
  NonNullable<VisitCompletionStructuredEdit["patientMessageChannel"]>,
  string
> = {
  portal: "portal draft",
  print: "print summary",
  sms: "SMS scheduling note",
  translation: "translation requested",
};

const practiceReadinessOwnerLabel: Record<
  NonNullable<VisitCompletionStructuredEdit["practiceReadinessOwner"]>,
  string
> = {
  back_office: "back office",
  front_office: "front office",
  clinician: "clinician",
  billing: "billing",
};

function VisitCompletionDetailItem({ item }: { item: VisitCompletionItem }) {
  return (
    <li className="rounded-md border border-border bg-surface px-3 py-2">
      <div className="flex gap-2 text-sm leading-relaxed text-text">
        <span
          className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", toneDot[item.tone])}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p>{item.label}</p>
          {item.reason && (
            <p className="mt-1 text-xs leading-relaxed text-text-subtle">{item.reason}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone={toneBadge[item.tone]}>{itemStatusLabel[item.status]}</Badge>
        <Badge tone="neutral">Source: {itemSourceLabel[item.source]}</Badge>
        {typeof item.confidence === "number" && (
          <Badge tone="neutral">Confidence {Math.round(item.confidence * 100)}%</Badge>
        )}
        {item.requiresPhysicianApproval && (
          <Badge tone="accent">Physician approval required</Badge>
        )}
      </div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
        Item evidence
      </p>
    </li>
  );
}

function VisitCompletionLine({ item }: { item: VisitCompletionItem }) {
  return (
    <li className="grid grid-cols-[14px_1fr] gap-2 text-sm leading-relaxed text-text">
      <span
        className={cn("mt-2 h-2 w-2 rounded-full", toneDot[item.tone])}
        aria-hidden="true"
      />
      <span>
        <span>{item.label}</span>
        <span className="ml-2 inline-flex items-center gap-1 align-middle">
          {item.dataMode !== "deterministic_heuristic" && (
            <Badge tone="neutral">{dataModeLabel[item.dataMode]}</Badge>
          )}
          {item.reason && item.tone !== "neutral" && (
            <Badge tone={toneBadge[item.tone]}>Source</Badge>
          )}
        </span>
      </span>
    </li>
  );
}

function VisitCompletionActionList({
  actions,
  onAction,
}: {
  actions: VisitCompletionAction[];
  onAction: (action: VisitCompletionAction) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 px-4 pb-4">
      {actions.map((action) => {
        const Icon = actionIcons[action.id] ?? FileText;

        return (
          <Button
            key={action.id}
            size="sm"
            variant={action.variant === "primary" ? "secondary" : "ghost"}
            className={cn(
              "h-8 rounded-md px-2.5 text-xs",
              action.variant === "primary" &&
                "border-accent/25 bg-accent-soft text-accent hover:bg-accent-soft",
            )}
            title={action.placeholderCopy}
            aria-label={`${action.label}: ${action.placeholderCopy}`}
            onClick={() => onAction(action)}
            leadingIcon={<Icon className="h-3.5 w-3.5" />}
          >
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}

function VisitCompletionReviewPanel({
  review,
  activeCard,
  onSelectCard,
}: {
  review: VisitCompletionReview;
  activeCard?: VisitCompletionCard;
  onSelectCard: (cardId: VisitCompletionCardId) => void;
}) {
  return (
    <div className="mx-5 mb-5 rounded-lg border border-accent/20 bg-accent-soft/35 px-4 py-4 lg:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-text">Review selected actions</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
            Release readiness
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            {review.resolvedCardCount} of {review.totalCardCount} cards resolved.{" "}
            {review.isReadyForRelease
              ? "Ready for physician release review."
              : "Confirmation required before release."}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            Release creates only reviewed tasks, drafts, and audit records after physician
            approval.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            It does not place clinical orders, send patient messages, submit billing, book
            appointments, or overwrite chart data.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <ReviewMetric label="Resolved" value={review.resolvedCardCount} />
          <ReviewMetric label="Needs confirm" value={review.needsConfirmationCount} />
          <ReviewMetric label="Held out" value={review.deferredSections.length + review.removedSections.length} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
              Selected for release
            </p>
            <Badge tone="accent">Physician release required</Badge>
          </div>
          <ReviewSectionList sections={review.selectedSections} onSelectCard={onSelectCard} />
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
              Current focus
            </p>
            <p className="mt-2 text-sm font-semibold text-text">
              {activeCard?.title ?? "No action selected"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              Open details to confirm, or use the card controls to edit, remove, or defer before
              release.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
              Held out
            </p>
            <p className="mt-2 text-xs leading-relaxed text-text-muted">
              {review.deferredCount + review.removedCount === 0
                ? "Nothing has been removed or deferred."
                : `${review.deferredCount} deferred and ${review.removedCount} removed from this release review.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisitCompletionProgressPanel({
  cards,
  review,
  isReleased,
  onSelectCard,
}: {
  cards: VisitCompletionCard[];
  review: VisitCompletionReview;
  isReleased: boolean;
  onSelectCard: (cardId: VisitCompletionCardId) => void;
}) {
  const progressPercent =
    review.totalCardCount === 0
      ? 0
      : Math.round((review.resolvedCardCount / review.totalCardCount) * 100);
  const displayedProgressPercent = isReleased ? 100 : progressPercent;
  const practiceReadinessNext = review.needsConfirmationSections.find(
    (section) => section.cardId === "practice_readiness",
  );
  const nextSection = isReleased
    ? undefined
    : practiceReadinessNext ?? review.needsConfirmationSections[0];
  const nextLabel =
    isReleased
      ? "Care Plan Released"
      : nextSection?.cardId === "practice_readiness"
      ? "Review Practice Readiness"
      : nextSection
        ? `Review ${nextSection.title}`
        : "Final release review";

  return (
    <div className="mx-5 mb-5 rounded-lg border border-accent/20 bg-surface px-4 py-4 shadow-sm lg:mx-6 lg:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Progress toward release
            </p>
            <Badge tone={isReleased ? "success" : review.isReadyForRelease ? "success" : "warning"}>
              {isReleased
                ? "Released"
                : review.isReadyForRelease
                  ? "Ready"
                  : `${review.needsConfirmationCount} left`}
            </Badge>
          </div>
          <p className="mt-2 text-sm font-semibold text-text">
            {isReleased
              ? "Care Plan Released"
              : review.isReadyForRelease
                ? "All confirmation workflows are resolved."
                : `${review.resolvedCardCount} of ${review.totalCardCount} confirmations complete.`}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${displayedProgressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-text-muted">
            {isReleased
              ? "Care actions have been durably saved and routed."
              : review.isReadyForRelease
              ? "Release Care Plan now sits after the confirmation workflow for final physician review."
              : "Confirm, edit, remove, or defer each card. The final release remains blocked until every card has a physician disposition. No actions have been released."}
          </p>
        </div>

        <div className="rounded-lg border border-highlight/35 bg-highlight-soft px-4 py-3 lg:w-[330px]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
            Next suggested step
          </p>
          <p className="mt-2 text-sm font-semibold text-text">{nextLabel}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            {isReleased
              ? "Audited physician actions have been durably saved and task handoffs are routed to queues."
              : nextSection?.cardId === "practice_readiness"
              ? "AI is flagging Practice Readiness because coding support, documentation gaps, prior auth risk, and staff tasks are easiest to clean up before release."
              : nextSection
                ? "AI is keeping the next unresolved card visible so the checkout flow feels like forward motion, not a scavenger hunt."
                : "Everything is resolved. The next action is final physician release review."}
          </p>
          {nextSection && !isReleased && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => onSelectCard(nextSection.cardId)}
              leadingIcon={<Eye className="h-3.5 w-3.5" />}
            >
              {nextLabel}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
        {cards.map((card) => {
          const section = progressSectionForCard(review, card.id);
          const status = section?.status ?? "selected";

          return (
            <button
              key={card.id}
              type="button"
              className="rounded-md border border-border bg-surface-muted/35 px-3 py-2 text-left transition hover:border-accent/35 hover:bg-accent-soft/35"
              onClick={() => onSelectCard(card.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-text">{card.title}</p>
                <Badge tone={statusBadgeTone[status]}>{statusLabel[status]}</Badge>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function progressSectionForCard(
  review: VisitCompletionReview,
  cardId: VisitCompletionCardId,
) {
  return (
    review.selectedSections.find((section) => section.cardId === cardId) ??
    review.removedSections.find((section) => section.cardId === cardId) ??
    review.deferredSections.find((section) => section.cardId === cardId)
  );
}

export function FinalReleaseReviewPanel({
  payload,
  isOpen,
  onToggle,
  isReleasing,
  releaseError,
  onRelease,
  isReleased,
}: {
  payload: VisitCompletionReleasePayload;
  isOpen: boolean;
  onToggle: () => void;
  isReleasing: boolean;
  releaseError: string | null;
  onRelease: () => void;
  isReleased: boolean;
}) {
  return (
    <div className="mx-5 mb-5 rounded-lg border border-border bg-surface px-4 py-4 shadow-sm lg:mx-6 lg:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Final release review
            </p>
            <Badge tone={payload.canRelease ? "success" : "warning"}>
              {payload.canRelease ? "Ready" : "Blocked"}
            </Badge>
          </div>
          <h3 className="mt-1 text-lg font-semibold text-text">Structured release payload</h3>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-muted">
            {payload.canRelease
              ? "Release Care Plan is ready for final physician review."
              : "Release Care Plan is blocked until every card has an explicit physician disposition."}
          </p>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-muted">
            Release Care Plan creates reviewed tasks/drafts and an audit record after physician
            approval.
          </p>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-muted">
            It does not place clinical orders, send patient messages, submit billing, book
            appointments, or overwrite chart data.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={onToggle}
            title="Preview the structured release payload"
            leadingIcon={<FileText className="h-3.5 w-3.5" />}
          >
            Preview release payload
          </Button>
          {!isReleased && (
            <Button
              size="sm"
              variant="primary"
              disabled={!payload.canRelease || isReleasing}
              onClick={onRelease}
              title="Release Care Plan"
              leadingIcon={isReleasing ? <span className="animate-spin mr-1">⌛</span> : <Check className="h-3.5 w-3.5" />}
            >
              {isReleasing ? "Releasing..." : "Release Care Plan"}
            </Button>
          )}
        </div>
        {releaseError && (
          <div className="mt-3 w-full rounded-md border border-danger/30 bg-red-50/50 px-3 py-2 text-xs text-danger">
            {releaseError}
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center md:grid-cols-4">
        <ReviewMetric label="Included" value={payload.summary.includedCards} />
        <ReviewMetric label="Held out" value={payload.summary.heldOutCards} />
        <ReviewMetric label="Unresolved" value={payload.summary.unresolvedCards} />
        <ReviewMetric label="Audit events" value={payload.auditEvents.length} />
      </div>

      {isOpen && (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-lg border border-border bg-surface-muted/35 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
              Ready cards
            </p>
            <ReleasePayloadSectionList
              sections={payload.includedSections}
              emptyCopy="No cards are ready for release yet."
            />
          </div>

          <div className="rounded-lg border border-border bg-surface-muted/35 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
              Held-out or unresolved cards
            </p>
            <ReleasePayloadSectionList
              sections={[...payload.heldOutSections, ...payload.unresolvedSections]}
              emptyCopy="No held-out or unresolved cards."
            />
          </div>

          <div className="rounded-lg border border-border bg-surface-muted/35 px-4 py-3 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
                Payload safety contract
              </p>
              <Badge tone="highlight">{payload.mode}</Badge>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-muted md:grid-cols-3">
              <PayloadSafetyFlag label="Clinical" value={payload.sideEffects.clinical} />
              <PayloadSafetyFlag label="Billing" value={payload.sideEffects.billing} />
              <PayloadSafetyFlag
                label="Patient message"
                value={payload.sideEffects.patientCommunication}
              />
              <PayloadSafetyFlag label="Scheduling" value={payload.sideEffects.scheduling} />
              <PayloadSafetyFlag label="Staff task" value={payload.sideEffects.staffAssignment} />
              <PayloadSafetyFlag label="Chart write" value={payload.sideEffects.chartWrite} />
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function ReleasePayloadSectionList({
  sections,
  emptyCopy,
}: {
  sections: VisitCompletionReleasePayload["includedSections"];
  emptyCopy: string;
}) {
  if (sections.length === 0) {
    return <p className="mt-3 text-sm text-text-muted">{emptyCopy}</p>;
  }

  return (
    <div className="mt-3 space-y-2">
      {sections.map((section) => (
        <ReleasePayloadSectionCard key={section.cardId} section={section} />
      ))}
    </div>
  );
}

function ReleasePayloadSectionCard({
  section,
}: {
  section: VisitCompletionReleasePayload["includedSections"][number];
}) {
  const structuredDetails = structuredReleaseDetailsForSection(section);

  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-text">{section.title}</p>
        <Badge tone={statusBadgeTone[section.status]}>{statusLabel[section.status]}</Badge>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        {section.labels.slice(0, 2).join("; ")}
        {section.labels.length > 2 ? `; +${section.labels.length - 2} more` : ""}
      </p>
      {structuredDetails.length > 0 && (
        <div className="mt-3 rounded-md border border-accent/20 bg-accent-soft/35 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            Physician-edited release details
          </p>
          <ul className="mt-2 space-y-1">
            {structuredDetails.map((detail) => (
              <li key={detail} className="text-xs leading-relaxed text-text-muted">
                {detail}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(section.confirmationNote || section.editNote) && (
        <p className="mt-2 text-xs leading-relaxed text-text-subtle">
          {section.confirmationNote ?? section.editNote}
        </p>
      )}
    </div>
  );
}

function structuredReleaseDetailsForSection(
  section: VisitCompletionReleasePayload["includedSections"][number],
): string[] {
  const edit = section.structuredEdit;
  if (!edit) {
    return [];
  }

  const details: string[] = [];
  if (edit.selectedItemIds !== undefined) {
    details.push(`${section.labels.length} reviewed action${section.labels.length === 1 ? "" : "s"}`);
  }
  if (edit.followUpInterval) {
    details.push(`Interval: ${edit.followUpInterval}`);
  }
  if (edit.followUpRouting) {
    details.push(`Handoff: ${followUpRoutingLabel[edit.followUpRouting]}`);
  }
  if (edit.patientMessageChannel) {
    details.push(`Channel: ${patientMessageChannelLabel[edit.patientMessageChannel]}`);
  }
  if (edit.patientMessageDraft) {
    details.push("Patient draft edited");
  }
  if (edit.practiceReadinessOwner) {
    details.push(`Owner: ${practiceReadinessOwnerLabel[edit.practiceReadinessOwner]}`);
  }
  if (edit.physicianNote) {
    details.push("Physician note captured");
  }

  return details;
}

function PayloadSafetyFlag({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <dt className="font-medium text-text">{label}</dt>
      <dd className="mt-1">{value ? "Draft/task artifact" : "No direct action"}</dd>
    </div>
  );
}

function ReviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 rounded-md border border-border bg-surface px-3 py-2">
      <p className="text-lg font-semibold text-text">{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-subtle">
        {label}
      </p>
    </div>
  );
}

function ReviewSectionList({
  sections,
  onSelectCard,
}: {
  sections: VisitCompletionReview["selectedSections"];
  onSelectCard: (cardId: VisitCompletionCardId) => void;
}) {
  if (sections.length === 0) {
    return (
      <p className="mt-3 text-sm text-text-muted">
        No selected care actions. Approve or edit a card to include it in the release review.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {sections.map((section) => (
        <button
          key={section.cardId}
          type="button"
          className="w-full rounded-md border border-border/80 bg-surface-muted/45 px-3 py-2 text-left transition hover:border-accent/35 hover:bg-accent-soft/40"
          onClick={() => onSelectCard(section.cardId)}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-text">{section.title}</p>
            <Badge tone={statusBadgeTone[section.status]}>{statusLabel[section.status]}</Badge>
          </div>
          <ul className="mt-2 space-y-1">
            {section.labels.slice(0, 3).map((label) => (
              <li key={label} className="text-xs leading-relaxed text-text-muted">
                {label}
              </li>
            ))}
          </ul>
          {section.labels.length > 3 && (
            <p className="mt-1 text-xs font-medium text-accent">
              +{section.labels.length - 3} more
            </p>
          )}
          {section.editNote && (
            <p className="mt-2 text-xs leading-relaxed text-text-muted">
              Edit note: {section.editNote}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}
