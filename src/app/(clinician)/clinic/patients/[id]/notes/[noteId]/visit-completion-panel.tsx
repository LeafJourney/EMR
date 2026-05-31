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
  approved: "Approved; confirm",
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
        cardStates[section.cardId] = {
          status: section.status,
          editNote: section.editNote,
          confirmationNote: section.confirmationNote,
        };
      }
      for (const section of releasedPayload.heldOutSections) {
        cardStates[section.cardId] = {
          status: section.status,
          editNote: section.editNote,
          confirmationNote: section.confirmationNote,
        };
      }
      for (const section of releasedPayload.unresolvedSections) {
        cardStates[section.cardId] = {
          status: section.status,
          editNote: section.editNote,
          confirmationNote: section.confirmationNote,
        };
      }
      return { cardStates };
    }
    return initializeVisitCompletionSelection(bundle);
  });

  const [releaseReviewOpen, setReleaseReviewOpen] = React.useState(!releasedPayload);
  const [activeCardId, setActiveCardId] = React.useState<VisitCompletionCardId>(
    bundle.cards[0]?.id ?? "orders",
  );
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
        cardStates[section.cardId] = {
          status: section.status,
          editNote: section.editNote,
          confirmationNote: section.confirmationNote,
        };
      }
      for (const section of releasedPayload.heldOutSections) {
        cardStates[section.cardId] = {
          status: section.status,
          editNote: section.editNote,
          confirmationNote: section.confirmationNote,
        };
      }
      for (const section of releasedPayload.unresolvedSections) {
        cardStates[section.cardId] = {
          status: section.status,
          editNote: section.editNote,
          confirmationNote: section.confirmationNote,
        };
      }
      setSelectionState({ cardStates });
      setReleaseReviewOpen(false);
      setReleasePayloadOpen(false);
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

  function openCardDetails(cardId: VisitCompletionCardId) {
    setActiveCardId(cardId);
    setReleaseReviewOpen(true);
  }

  function confirmCard(card: VisitCompletionCard) {
    applyLocalAction({
      type: "confirm_card",
      cardId: card.id,
      confirmationNote: detailCopy[card.id].confirmNote,
    });
    setReleaseReviewOpen(true);
  }

  function handleCardAction(card: VisitCompletionCard, action: VisitCompletionAction) {
    openCardDetails(card.id);

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
        setEditingCardId(card.id);
        setEditDraft(selectionState.cardStates[card.id]?.editNote ?? "");
        return;
      case "order_review":
      case "coding_review":
      case "view_checks":
        return;
    }
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
      <div className="flex flex-col gap-5 border-b border-border/70 bg-surface-muted/60 px-5 py-5 lg:flex-row lg:items-start lg:justify-between lg:px-6">
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

        <ReleaseCarePlanButton
          bundle={bundle}
          review={review}
          isOpen={releaseReviewOpen}
          onToggle={() => setReleaseReviewOpen((open) => !open)}
          isReleased={isReleased}
        />
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
        <VisitCompletionCardDetailPanel
          card={activeCard}
          cardState={activeCardState}
          onConfirm={() => confirmCard(activeCard)}
          onEdit={() => {
            openCardDetails(activeCard.id);
            setEditingCardId(activeCard.id);
            setEditDraft(selectionState.cardStates[activeCard.id]?.editNote ?? "");
          }}
          onRemove={() => {
            openCardDetails(activeCard.id);
            applyLocalAction({ type: "remove_card", cardId: activeCard.id });
          }}
          onDefer={() => {
            openCardDetails(activeCard.id);
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

function ReleaseCarePlanButton({
  bundle,
  review,
  isOpen,
  onToggle,
  isReleased,
}: {
  bundle: VisitCompletionBundle;
  review: VisitCompletionReview;
  isOpen: boolean;
  onToggle: () => void;
  isReleased: boolean;
}) {
  if (isReleased) {
    return (
      <div className="w-full lg:w-[320px]">
        <Button
          size="md"
          className="w-full"
          disabled
          leadingIcon={<Check className="h-4 w-4" />}
        >
          Care Plan Released
        </Button>
        <div className="mt-3 rounded-lg border border-success/35 bg-success-soft px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-text">Release status</p>
            <Badge tone="success">Released</Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            Care actions have been durably saved and routed.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="w-full lg:w-[320px]">
      <Button
        size="md"
        className="w-full"
        aria-disabled={!bundle.releaseEnabled}
        aria-label="Open release review"
        onClick={onToggle}
        title="Open release review"
        leadingIcon={<Check className="h-4 w-4" />}
      >
        {bundle.primaryActionLabel}
      </Button>
      <div className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-text">Release readiness</p>
          <Badge tone={review.isReadyForRelease ? "success" : isOpen ? "warning" : "neutral"}>
            {review.isReadyForRelease ? "Ready" : isOpen ? "Review open" : "Review closed"}
          </Badge>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          {review.resolvedCardCount} of {review.totalCardCount} cards resolved.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          {review.isReadyForRelease
            ? "Ready for physician release review."
            : "Confirmation required before release."}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          No actions have been released.
        </p>
      </div>
    </div>
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

function VisitCompletionCardDetailPanel({
  card,
  cardState,
  onConfirm,
  onEdit,
  onRemove,
  onDefer,
  isReleased,
}: {
  card: VisitCompletionCard;
  cardState: VisitCompletionSelectionState["cardStates"][VisitCompletionCardId];
  onConfirm: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onDefer: () => void;
  isReleased: boolean;
}) {
  const Icon = cardIcons[card.id];
  const copy = detailCopy[card.id];
  const resolved = isResolvedStatus(cardState.status);

  return (
    <div className="mx-5 mb-5 rounded-lg border border-border bg-surface px-4 py-4 shadow-sm lg:mx-6 lg:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                Click in to confirm
              </p>
              <Badge tone={statusBadgeTone[cardState.status]}>{statusLabel[cardState.status]}</Badge>
            </div>
            <h3 className="mt-1 text-lg font-semibold text-text">{card.title} confirmation</h3>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-muted">
              {copy.instruction}
            </p>
          </div>
        </div>

        {!isReleased && (
          <div className="flex flex-wrap gap-2">
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
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-lg border border-border bg-surface-muted/35 px-4 py-3">
          <p className="text-sm font-semibold text-text">{copy.question}</p>
          <ul className="mt-3 space-y-2">
            {card.items.map((item) => (
              <VisitCompletionDetailItem key={item.id} item={item} />
            ))}
          </ul>
        </div>

        <div className="space-y-3">
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
              {resolved ? "Resolved for release review" : "Confirmation required before release."}
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
      </div>
    </div>
  );
}

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

function FinalReleaseReviewPanel({
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
        <div key={section.cardId} className="rounded-md border border-border bg-surface px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-text">{section.title}</p>
            <Badge tone={statusBadgeTone[section.status]}>{statusLabel[section.status]}</Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            {section.labels.slice(0, 2).join("; ")}
            {section.labels.length > 2 ? `; +${section.labels.length - 2} more` : ""}
          </p>
          {(section.confirmationNote || section.editNote) && (
            <p className="mt-2 text-xs leading-relaxed text-text-subtle">
              {section.confirmationNote ?? section.editNote}
            </p>
          )}
        </div>
      ))}
    </div>
  );
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
