"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { useState, useEffect, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { AgentSignalCard } from "@/components/ui/agent-signal";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";
import {
  approveMessageDraft,
  editAndApproveMessageDraft,
  rejectMessageDraft,
  batchApproveMessages,
  batchRejectMessages,
  type ApprovalResult,
  type BatchResult,
} from "./actions";

// ---------------------------------------------------------------------------
// Types — generic enough that future approval kinds (note drafts, claim
// appeals, refund proposals) can plug in without reshaping the client.
// ---------------------------------------------------------------------------

export interface ApprovalItem {
  id: string;
  kind: "message_draft"; // future: "note_draft" | "appeal_draft" | "refund_proposal"
  agent: string | null;
  createdAt: string;
  body: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  // Message-draft-specific fields
  threadId: string;
  threadSubject: string;
  triageUrgency: "emergency" | "high" | "routine" | "low" | null;
  triageCategory: string | null;
  triageSummary: string | null;
  triageSafetyFlags: string[] | null;
}

// ---------------------------------------------------------------------------
// <ApprovalsInboxList /> — container with multi-select bulk actions
// ---------------------------------------------------------------------------

export function ApprovalsInboxList({ items }: { items: ApprovalItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(null);
  const [pending, startTransition] = useTransition();
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  // If the underlying items change (server revalidated), drop stale ids.
  useEffect(() => {
    const ids = new Set(items.map((i) => i.id));
    setSelected((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (ids.has(id)) next.add(id);
      return next;
    });
  }, [items]);

  const allSelected = items.length > 0 && selected.size === items.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAll = () => setSelected(new Set(items.map((i) => i.id)));
  const clearAll = () => setSelected(new Set());

  const handleConfirm = () => {
    if (!confirming) return;
    const ids = Array.from(selected);
    const action = confirming;
    setConfirming(null);
    startTransition(async () => {
      const result: BatchResult =
        action === "approve"
          ? await batchApproveMessages(ids)
          : await batchRejectMessages(ids);
      setResultMessage(
        result.ok
          ? `${action === "approve" ? "Sent" : "Discarded"} ${result.succeeded} draft${result.succeeded === 1 ? "" : "s"}.${
              result.failed > 0 ? ` ${result.failed} failed.` : ""
            }`
          : `Bulk ${action} failed.`,
      );
      // Drop selection so the floating bar disappears.
      setSelected(new Set());
      // Auto-clear the toast after a moment.
      setTimeout(() => setResultMessage(null), 4500);
    });
  };

  const selectedItems = useMemo(
    () => items.filter((i) => selected.has(i.id)),
    [items, selected],
  );

  return (
    <>
      {/* Selection bar above the list */}
      <div className="flex items-center justify-between mb-4 text-xs text-text-muted">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={allSelected ? clearAll : selectAll}
            className="text-accent hover:underline"
          >
            {allSelected ? "Clear selection" : "Select all"}
          </button>
          {selected.size > 0 && (
            <span className="text-text-subtle tabular-nums">
              {selected.size} of {items.length} selected
            </span>
          )}
        </div>
        {resultMessage && (
          <span className="text-success">{resultMessage}</span>
        )}
      </div>

      <div className="space-y-5 pb-28">
        {items.map((item) => (
          <ApprovalCardRow
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onToggle={() => toggle(item.id)}
          />
        ))}
      </div>

      {selected.size > 0 && (
        <FloatingBulkBar
          count={selected.size}
          pending={pending}
          onApprove={() => setConfirming("approve")}
          onReject={() => setConfirming("reject")}
          onClear={clearAll}
        />
      )}

      {confirming && (
        <ConfirmModal
          kind={confirming}
          items={selectedItems}
          onCancel={() => setConfirming(null)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// <FloatingBulkBar /> — sticky action strip at the bottom of the screen
// ---------------------------------------------------------------------------

function FloatingBulkBar({
  count,
  pending,
  onApprove,
  onReject,
  onClear,
}: {
  count: number;
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
  onClear: () => void;
}) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 px-4 w-full max-w-2xl pointer-events-none">
      <Card
        tone="raised"
        className="pointer-events-auto flex items-center gap-3 px-4 py-3 shadow-lg border-accent/30"
      >
        <span className="text-sm font-medium text-text">
          {count} selected
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-text-subtle hover:text-text"
        >
          Clear
        </button>
        <div className="flex-1" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onReject}
          disabled={pending}
          className="text-text-muted hover:text-danger"
        >
          Reject selected ({count})
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onApprove}
          disabled={pending}
        >
          {pending ? "Working…" : `Approve selected (${count})`}
        </Button>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// <ConfirmModal /> — block destructive bulk actions behind a confirmation
// ---------------------------------------------------------------------------

function ConfirmModal({
  kind,
  items,
  onCancel,
  onConfirm,
}: {
  kind: "approve" | "reject";
  items: ApprovalItem[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isApprove = kind === "approve";
  const emergencyCount = items.filter(
    (i) => i.triageUrgency === "emergency",
  ).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isApprove ? "Confirm bulk approve" : "Confirm bulk reject"}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <Card
        tone="raised"
        className="w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <p className="text-[11px] uppercase tracking-[0.14em] text-text-subtle">
            Confirm
          </p>
          <h2 className="font-display text-lg text-text tracking-tight">
            {isApprove
              ? `Send ${items.length} draft${items.length === 1 ? "" : "s"}?`
              : `Discard ${items.length} draft${items.length === 1 ? "" : "s"}?`}
          </h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-text-muted">
            {isApprove
              ? "Each selected draft will be sent to its patient as written. This cannot be undone."
              : "Each selected draft will be permanently discarded. The thread itself stays put."}
          </p>
          {emergencyCount > 0 && (
            <p className="text-sm text-danger font-medium">
              ⚠ {emergencyCount} of these is marked EMERGENCY. Review carefully.
            </p>
          )}
          <ul className="text-xs text-text-subtle max-h-40 overflow-y-auto space-y-1 border-t border-border/50 pt-3">
            {items.slice(0, 8).map((i) => (
              <li key={i.id} className="truncate">
                · {i.patientFirstName} {i.patientLastName} —{" "}
                <span className="italic">{i.threadSubject}</span>
              </li>
            ))}
            {items.length > 8 && (
              <li className="text-text-subtle">…and {items.length - 8} more</li>
            )}
          </ul>
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2 bg-surface-muted/40">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isApprove ? "primary" : "danger"}
            onClick={onConfirm}
          >
            {isApprove ? "Send all" : "Discard all"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// <ApprovalCardRow /> — one draft, fully reviewable
// ---------------------------------------------------------------------------

function ApprovalCardRow({
  item,
  selected,
  onToggle,
}: {
  item: ApprovalItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(item.body);

  // Reset the local edit state when the server re-renders with new items
  useEffect(() => {
    setEditBody(item.body);
    setEditing(false);
  }, [item.id, item.body]);

  const kicker = `${item.patientFirstName} ${item.patientLastName} · "${item.threadSubject}"`;
  const headline = `Drafted reply for ${item.patientFirstName}`;

  const pills: string[] = [];
  if (item.triageCategory) pills.push(humanizeCategory(item.triageCategory));
  pills.push("Used patient chart");
  if (item.triageSafetyFlags && item.triageSafetyFlags.length > 0) {
    pills.push(`${item.triageSafetyFlags.length} safety flag${item.triageSafetyFlags.length === 1 ? "" : "s"}`);
  }

  return (
    <div className={cn("flex items-start gap-3", selected && "")}>
      <label className="pt-6 cursor-pointer select-none flex items-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select draft for ${item.patientFirstName} ${item.patientLastName}`}
          className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent/40"
        />
      </label>
      <div className={cn("flex-1 min-w-0 transition-shadow", selected && "ring-2 ring-accent/30 rounded-xl")}>
        <AgentSignalCard
          agent={item.agent}
          headline={headline}
          kicker={kicker}
          contextPills={pills}
          timestamp={formatRelative(item.createdAt)}
          urgency={item.triageUrgency}
          footer={
            <FooterDetail
              summary={item.triageSummary}
              safetyFlags={item.triageSafetyFlags}
              patientId={item.patientId}
            />
          }
          actions={
            editing ? (
              <EditApproveForm
                messageId={item.id}
                body={editBody}
                onCancel={() => {
                  setEditing(false);
                  setEditBody(item.body);
                }}
              />
            ) : (
              <ActionButtons
                messageId={item.id}
                onEdit={() => setEditing(true)}
              />
            )
          }
        >
          {editing ? (
            <Textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={Math.max(4, Math.min(12, item.body.split("\n").length + 2))}
              className="bg-surface"
            />
          ) : (
            item.body
          )}
        </AgentSignalCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer — summary + safety flags + jump-to-thread link
// ---------------------------------------------------------------------------

function FooterDetail({
  summary,
  safetyFlags,
  patientId,
}: {
  summary: string | null;
  safetyFlags: string[] | null;
  patientId: string;
}) {
  return (
    <div className="space-y-2">
      {summary && (
        <div className="text-[12px] text-text-muted leading-relaxed">
          <span className="text-[10px] uppercase tracking-wider text-text-subtle">
            Thread summary ·{" "}
          </span>
          {summary}
        </div>
      )}
      {safetyFlags && safetyFlags.length > 0 && (
        <div className="rounded-lg bg-danger/[0.06] border border-danger/25 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-danger mb-1">
            Safety flags
          </p>
          <ul className="space-y-0.5">
            {safetyFlags.map((f, i) => (
              <li key={i} className="text-[11px] text-danger leading-relaxed">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="pt-1">
        <Link
          href={`/clinic/patients/${patientId}?tab=correspondence`}
          className="text-[11px] text-accent hover:underline"
        >
          Open full patient chart →
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action button groups
// ---------------------------------------------------------------------------

function ActionButtons({
  messageId,
  onEdit,
}: {
  messageId: string;
  onEdit: () => void;
}) {
  const [approveState, approveAction] = useFormState<
    ApprovalResult | null,
    FormData
  >(approveMessageDraft, null);
  const [rejectState, rejectAction] = useFormState<
    ApprovalResult | null,
    FormData
  >(rejectMessageDraft, null);

  return (
    <div className="flex items-center gap-2">
      <form action={rejectAction}>
        <input type="hidden" name="messageId" value={messageId} />
        <RejectButton />
      </form>
      <Button type="button" size="sm" variant="ghost" onClick={onEdit}>
        Edit
      </Button>
      <form action={approveAction}>
        <input type="hidden" name="messageId" value={messageId} />
        <ApproveButton />
      </form>
      {(approveState?.ok === false || rejectState?.ok === false) && (
        <span className="text-[11px] text-danger ml-2">
          {approveState?.ok === false
            ? approveState.error
            : rejectState?.ok === false
              ? rejectState.error
              : ""}
        </span>
      )}
    </div>
  );
}

function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Sending..." : "Approve & send"}
    </Button>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant="ghost"
      disabled={pending}
      className="text-text-subtle hover:text-danger"
    >
      {pending ? "..." : "Discard"}
    </Button>
  );
}

function EditApproveForm({
  messageId,
  body,
  onCancel,
}: {
  messageId: string;
  body: string;
  onCancel: () => void;
}) {
  const [state, formAction] = useFormState<ApprovalResult | null, FormData>(
    editAndApproveMessageDraft,
    null,
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="body" value={body} />
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <EditSubmitButton />
      {state?.ok === false && (
        <span className="text-[11px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

function EditSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Sending..." : "Send edits"}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  symptom_report: "Symptom report",
  side_effect: "Side effect",
  refill_request: "Refill request",
  appointment_question: "Appointment",
  billing_question: "Billing",
  dosing_question: "Dosing",
  result_inquiry: "Lab/Result",
  general_question: "General",
  gratitude: "Gratitude",
  unknown: "Unclassified",
};

function humanizeCategory(raw: string): string {
  return CATEGORY_LABELS[raw] ?? raw;
}
