"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { AgentSignal } from "@/components/ui/agent-signal";
import {
  InThreadDraftReview,
  DraftReadyBanner,
} from "@/components/agent/in-thread-draft-review";
import { resolveAgentMeta } from "@/lib/agents/ui-registry";
import { formatRelative } from "@/lib/utils/format";
import { sendChartReply, type ChartReplyResult } from "./correspondence-actions";
import { useToast } from "@/components/ui/toast";

/* ── Serialized types ─────────────────────────────────────────── */

export interface SerializedMessage {
  id: string;
  body: string;
  status: string;
  aiDrafted: boolean;
  senderUserId: string | null;
  senderAgent: string | null;
  sender: { firstName: string; lastName: string } | null;
  createdAt: string;
}

export interface SerializedThread {
  id: string;
  subject: string;
  lastMessageAt: string;
  messages: SerializedMessage[];
  triageUrgency: string | null;
  triageCategory: string | null;
  triageSafetyFlags: string[] | null;
  triageSummary: string | null;
  triagedAt: string | null;
}

// ---------------------------------------------------------------------------
// Triage rendering helpers
// ---------------------------------------------------------------------------

const URGENCY_TONES: Record<string, { badge: "danger" | "warning" | "accent" | "success" | "neutral"; border: string; label: string }> = {
  emergency: {
    badge: "danger",
    border: "border-l-danger bg-danger/[0.03]",
    label: "🚨 EMERGENCY",
  },
  high: {
    badge: "warning",
    border: "border-l-[color:var(--warning)] bg-[color:var(--warning)]/[0.03]",
    label: "⚠ High urgency",
  },
  routine: {
    badge: "accent",
    border: "border-l-accent",
    label: "Routine",
  },
  low: {
    badge: "success",
    border: "border-l-success/60",
    label: "Low",
  },
};

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

interface CorrespondenceTabProps {
  threads: SerializedThread[];
  currentUserId: string;
  patientFirstName: string;
  patientLastName: string;
}

/* ── Reply submit button ──────────────────────────────────────── */

function ReplySubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Sending..." : "Send"}
    </Button>
  );
}

/* ── Inline reply compose ─────────────────────────────────────── */

function InlineReplyCompose({ threadId }: { threadId: string }) {
  const [state, formAction] = useFormState<ChartReplyResult | null, FormData>(
    sendChartReply,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      formRef.current?.reset();
      toast({ title: "Reply sent", variant: "success" });
    } else {
      toast({
        title: "Couldn't send reply",
        description: state.error,
        variant: "error",
      });
    }
  }, [state, toast]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="border-t border-border p-4 bg-surface"
    >
      <input type="hidden" name="threadId" value={threadId} />
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <Textarea
            name="body"
            rows={2}
            placeholder="Type your reply..."
            required
            className="resize-none"
          />
        </div>
        <ReplySubmitButton />
      </div>
    </form>
  );
}

/* ── Main correspondence tab component ────────────────────────── */

export function CorrespondenceTab({
  threads,
  currentUserId,
  patientFirstName,
  patientLastName,
}: CorrespondenceTabProps) {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    threads[0]?.id ?? null
  );

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  if (threads.length === 0) {
    return (
      <EmptyState
        title="No messages with this patient yet"
        description="Start a conversation to coordinate care, share updates, or answer questions."
      />
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 min-h-[480px]">
      {/* ── Thread list ──────────────────────────────────── */}
      <div className="md:w-[300px] shrink-0">
        <Card className="overflow-hidden">
          <div className="overflow-y-auto max-h-[720px]">
            {threads.map((t) => {
              const isActive = t.id === activeThreadId;
              const lastMsg = t.messages[0];
              const aiDraftMsg = t.messages.find(
                (m) => m.status === "draft" && m.aiDrafted,
              );
              const hasAiDraft = Boolean(aiDraftMsg);
              const urgency = t.triageUrgency ?? "";
              const urgencyTone = URGENCY_TONES[urgency];
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveThreadId(t.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border/60 transition-colors hover:bg-surface-muted border-l-[3px] ${
                    isActive
                      ? "bg-surface-muted"
                      : ""
                  } ${
                    urgency === "emergency"
                      ? "border-l-danger"
                      : urgency === "high"
                        ? "border-l-[color:var(--warning)]"
                        : urgency === "routine"
                          ? "border-l-accent/60"
                          : urgency === "low"
                            ? "border-l-success/40"
                            : "border-l-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-text truncate">
                      {t.subject}
                    </p>
                    <span className="text-[11px] text-text-subtle whitespace-nowrap shrink-0">
                      {formatRelative(t.lastMessageAt)}
                    </span>
                  </div>
                  {lastMsg && (
                    <p className="text-xs text-text-subtle line-clamp-1 mb-1.5">
                      {lastMsg.body}
                    </p>
                  )}
                  <div className="flex items-center gap-1 flex-wrap">
                    {urgencyTone && urgency !== "low" && (
                      <Badge tone={urgencyTone.badge} className="text-[9px]">
                        {urgencyTone.label}
                      </Badge>
                    )}
                    {t.triageCategory && (
                      <Badge tone="neutral" className="text-[9px]">
                        {CATEGORY_LABELS[t.triageCategory] ?? t.triageCategory}
                      </Badge>
                    )}
                    {hasAiDraft && aiDraftMsg && (
                      <AgentSignal
                        agent={aiDraftMsg.senderAgent}
                        label="draft ready"
                        showPopover={false}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ── Active thread detail ─────────────────────────── */}
      <Card
        className={`flex-1 flex flex-col overflow-hidden ${
          activeThread?.triageUrgency === "emergency"
            ? "border-l-4 border-l-danger"
            : activeThread?.triageUrgency === "high"
              ? "border-l-4 border-l-[color:var(--warning)]"
              : ""
        }`}
      >
        {activeThread ? (
          <>
            {/* Thread header */}
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3 mb-3">
                <Avatar
                  firstName={patientFirstName}
                  lastName={patientLastName}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-lg text-text leading-tight truncate">
                    {activeThread.subject}
                  </h3>
                  <p className="text-xs text-text-muted">
                    {patientFirstName} {patientLastName} &middot;{" "}
                    {activeThread.messages.length} message
                    {activeThread.messages.length !== 1 ? "s" : ""}
                    {activeThread.triagedAt && (
                      <>
                        {" · triaged "}
                        {formatRelative(activeThread.triagedAt)}
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Triage row */}
              {(activeThread.triageUrgency || activeThread.triageCategory) && (
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  {activeThread.triageUrgency &&
                    URGENCY_TONES[activeThread.triageUrgency] && (
                      <Badge
                        tone={URGENCY_TONES[activeThread.triageUrgency].badge}
                        className="text-[10px] font-semibold"
                      >
                        {URGENCY_TONES[activeThread.triageUrgency].label}
                      </Badge>
                    )}
                  {activeThread.triageCategory && (
                    <Badge tone="neutral" className="text-[10px]">
                      {CATEGORY_LABELS[activeThread.triageCategory] ??
                        activeThread.triageCategory}
                    </Badge>
                  )}
                  <AgentSignal
                    agent="correspondenceNurse:1.0.0"
                    label="triaged this thread"
                    className="ml-1"
                  />
                </div>
              )}

              {/* AI summary of the thread */}
              {activeThread.triageSummary && (
                <div className="rounded-lg bg-accent/[0.04] border border-accent/15 px-3 py-2.5 mb-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-accent mb-1">
                    Thread summary
                  </p>
                  <p className="text-xs text-text leading-relaxed">
                    {activeThread.triageSummary}
                  </p>
                </div>
              )}

              {/* Safety flags — always prominent if present */}
              {activeThread.triageSafetyFlags &&
                activeThread.triageSafetyFlags.length > 0 && (
                  <div className="rounded-lg bg-danger/[0.06] border border-danger/30 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-danger mb-1">
                      Safety flags — review immediately
                    </p>
                    <ul className="space-y-0.5">
                      {activeThread.triageSafetyFlags.map((flag, i) => (
                        <li
                          key={i}
                          className="text-xs text-danger leading-relaxed"
                        >
                          {flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>

            {/* Draft-ready banner: only shown when this thread has one or
                more unsent AI drafts waiting for clinician review. Gives
                the physician an at-a-glance cue before they scroll. */}
            {(() => {
              const pendingDrafts = activeThread.messages.filter(
                (m) => m.aiDrafted && m.status === "draft",
              );
              if (pendingDrafts.length === 0) return null;
              return (
                <DraftReadyBanner
                  agent={pendingDrafts[0].senderAgent}
                  draftCount={pendingDrafts.length}
                />
              );
            })()}

            {/* Messages area (chronological) */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {[...activeThread.messages].reverse().map((msg) => {
                const isOwn = msg.senderUserId === currentUserId;
                const senderName = isOwn
                  ? "You"
                  : msg.sender
                    ? `${msg.sender.firstName} ${msg.sender.lastName}`
                    : msg.senderAgent
                      ? msg.senderAgent.split(":")[0] ?? "AI Assistant"
                      : `${patientFirstName} ${patientLastName}`;

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`flex gap-2.5 max-w-[80%] ${isOwn ? "flex-row-reverse" : "flex-row"}`}
                    >
                      {!isOwn && (
                        <Avatar
                          firstName={
                            msg.sender?.firstName ?? patientFirstName
                          }
                          lastName={
                            msg.sender?.lastName ?? patientLastName
                          }
                          size="sm"
                          className="mt-1 shrink-0"
                        />
                      )}
                      <div>
                        <div
                          className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                            msg.aiDrafted && msg.status === "draft"
                              ? "bg-highlight-soft/40 text-text border border-highlight/30 border-dashed"
                              : isOwn
                                ? "bg-accent-soft text-text"
                                : "bg-surface-raised text-text border border-border/60"
                          }`}
                        >
                          {msg.body}
                        </div>
                        <div
                          className={`flex items-center gap-2 mt-1 flex-wrap ${isOwn ? "justify-end" : "justify-start"}`}
                        >
                          <span className="text-xs text-text-subtle">
                            {msg.aiDrafted
                              ? resolveAgentMeta(msg.senderAgent).displayName
                              : senderName}
                          </span>
                          <span className="text-xs text-text-subtle">
                            {formatRelative(msg.createdAt)}
                          </span>
                          {msg.aiDrafted && (
                            <AgentSignal
                              agent={msg.senderAgent}
                              label={
                                msg.status === "draft"
                                  ? "awaiting approval"
                                  : "drafted this"
                              }
                            />
                          )}
                        </div>
                        {msg.aiDrafted && msg.status === "draft" && (
                          <InThreadDraftReview
                            messageId={msg.id}
                            initialBody={msg.body}
                            agent={msg.senderAgent}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply compose bar */}
            <InlineReplyCompose threadId={activeThread.id} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-text-muted">
              Select a conversation to view messages
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
