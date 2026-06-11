"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
import { Bubble, CindySays, usePersistentState } from "./chart-kit";
import { cindyListSummary } from "@/lib/clinical/cindy-says";
import {
  CorrespondenceComposer,
  IdentityAvatar,
  fullName,
  type ComposerPayload,
} from "./correspondence-composer";

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

/* ── EMR-895 — urgency bubble colours ─────────────────────────────────────
   Urgent=red, High=yellow, Routine=green, Meds=blue; beige bubbles for the
   refill/newRx/thank-you/dosing/doctor's note descriptive tags. */

function urgencyBubble(
  urgency: string | null,
): { tone: "severe" | "mild" | "normal" | "info"; label: string } | null {
  switch (urgency) {
    case "emergency":
      return { tone: "severe", label: "Urgent" };
    case "high":
      return { tone: "mild", label: "High" };
    case "routine":
      return { tone: "normal", label: "Routine" };
    case "low":
      return { tone: "normal", label: "Routine" };
    default:
      return null;
  }
}

/** Categories that read as "Meds" get a blue bubble; some get a beige tag. */
const MEDS_CATEGORIES = new Set([
  "refill_request",
  "dosing_question",
  "side_effect",
]);

/** EMR-895 — beige descriptive tag for certain categories. */
const BEIGE_TAG: Record<string, string> = {
  refill_request: "refill",
  dosing_question: "dosing",
  gratitude: "thank-you",
  result_inquiry: "doctor's note",
};

/* ── Clickable bubble filters (EMR-895) ───────────────────────────────────
   Priority bubbles (Urgent/High/Routine/Meds) and beige reason tags act as
   click-to-filter chips over the threads already passed in. A filter key is a
   stable string; threadFilterKeys() returns every key a given thread carries.
   Pure client state — no schema/data change. */

/** The set of filter keys a thread carries via its triage bubbles/tags. */
function threadFilterKeys(thread: SerializedThread): string[] {
  const keys: string[] = [];
  const u = urgencyBubble(thread.triageUrgency);
  if (u) keys.push(`urgency:${u.label}`); // Urgent / High / Routine
  const category = thread.triageCategory ?? "";
  if (category && MEDS_CATEGORIES.has(category)) keys.push("meds");
  const beige = BEIGE_TAG[category];
  if (beige) keys.push(`beige:${beige}`);
  return keys;
}

/* ── Inbox folder state (EMR-895) ─────────────────────────────────────────
   Trash → 30-day trash folder; Archive → restorable archive. Persisted via
   localStorage (no schema column). */

type FolderName = "inbox" | "archive" | "trash";

interface FolderState {
  archived: string[];
  /** threadId → ISO timestamp of when it was trashed (30-day retention). */
  trashed: Record<string, string>;
}

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface CorrespondenceTabProps {
  threads: SerializedThread[];
  currentUserId: string;
  patientFirstName: string;
  patientLastName: string;
  /** EMR-896 — clicking the patient name returns to the top of the chart.
   *  Optional so the existing page.tsx call site keeps compiling. */
  patientId?: string;
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

/* ── Inbox row (EMR-895) ──────────────────────────────────────── */

function InboxRow({
  thread,
  isActive,
  isDraft,
  bubbleFilter,
  onFilter,
  onSelect,
  onArchive,
  onTrash,
}: {
  thread: SerializedThread;
  isActive: boolean;
  isDraft: boolean;
  /** Active bubble filter key, or null. */
  bubbleFilter: string | null;
  /** Toggle a bubble filter (click again to clear). */
  onFilter: (key: string) => void;
  onSelect: () => void;
  onArchive: () => void;
  onTrash: () => void;
}) {
  const lastMsg = thread.messages[0];
  const aiDraftMsg = thread.messages.find(
    (m) => m.status === "draft" && m.aiDrafted,
  );
  const hasAiDraft = Boolean(aiDraftMsg);
  const urgency = thread.triageUrgency ?? "";
  const uBubble = urgencyBubble(urgency);
  const category = thread.triageCategory ?? "";
  const beige = BEIGE_TAG[category];

  // EMR-895 — full ~12-word summary, NO "…" truncation.
  const summary = fullSummary(thread);

  return (
    <div
      className={`group relative border-b border-border/60 border-l-[3px] transition-colors hover:bg-surface-muted ${
        isActive ? "bg-surface-muted" : ""
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
      <button
        onClick={onSelect}
        className="w-full text-left px-4 py-3 pr-16"
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-sm font-medium text-text truncate">
            {thread.subject}
          </p>
          {/* EMR-895 — keep the date, drop the word "triaged". */}
          <span className="text-[11px] text-text-subtle whitespace-nowrap shrink-0">
            {formatRelative(thread.lastMessageAt)}
          </span>
        </div>

        {/* EMR-895 — FULL ~12-word summary, no truncation. */}
        <p className="text-xs text-text-subtle leading-snug">
          {summary}
        </p>
      </button>

      {/* EMR-895 — clickable bubble filters live OUTSIDE the select button so a
          click filters the inbox (toggle off by clicking again) instead of
          opening the thread. */}
      <div className="flex items-center gap-1 flex-wrap px-4 pb-3 -mt-0.5">
        {isDraft && (
          <Bubble tone="info" emoji="✏️">
            Draft
          </Bubble>
        )}
        {uBubble && (
          <Bubble
            tone={uBubble.tone}
            active={bubbleFilter === `urgency:${uBubble.label}`}
            title={`Filter: ${uBubble.label}`}
            onClick={() => onFilter(`urgency:${uBubble.label}`)}
          >
            {uBubble.label}
          </Bubble>
        )}
        {category && MEDS_CATEGORIES.has(category) && (
          <Bubble
            tone="info"
            active={bubbleFilter === "meds"}
            title="Filter: Meds"
            onClick={() => onFilter("meds")}
          >
            Meds
          </Bubble>
        )}
        {beige && (
          <Bubble
            tone="beige"
            active={bubbleFilter === `beige:${beige}`}
            title={`Filter: ${beige}`}
            onClick={() => onFilter(`beige:${beige}`)}
          >
            {beige}
          </Bubble>
        )}
        {category && !MEDS_CATEGORIES.has(category) && !beige && (
          <Badge tone="neutral" className="text-[9px]">
            {CATEGORY_LABELS[category] ?? category}
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

      {/* EMR-895 — hover actions: trash/archive/send. Hidden until hover. */}
      <div className="absolute top-2.5 right-2 hidden group-hover:flex items-center gap-1">
        <button
          type="button"
          title="Send / open"
          aria-label="Open thread"
          onClick={onSelect}
          className="h-6 w-6 rounded-md hover:bg-surface-raised flex items-center justify-center text-xs"
        >
          <span aria-hidden="true">📨</span>
        </button>
        <button
          type="button"
          title="Archive"
          aria-label="Archive thread"
          onClick={onArchive}
          className="h-6 w-6 rounded-md hover:bg-surface-raised flex items-center justify-center text-xs"
        >
          <span aria-hidden="true">🗄️</span>
        </button>
        <button
          type="button"
          title="Move to trash"
          aria-label="Trash thread"
          onClick={onTrash}
          className="h-6 w-6 rounded-md hover:bg-surface-raised flex items-center justify-center text-xs"
        >
          <span aria-hidden="true">🗑️</span>
        </button>
      </div>
    </div>
  );
}

/* ── Main correspondence tab component ────────────────────────── */

export function CorrespondenceTab({
  threads,
  currentUserId,
  patientFirstName,
  patientLastName,
  patientId,
}: CorrespondenceTabProps) {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    threads[0]?.id ?? null
  );
  const [composing, setComposing] = useState(false);
  const [folder, setFolder] = useState<FolderName>("inbox");
  // EMR-895 — active bubble/beige filter key (null = no filter).
  const [bubbleFilter, setBubbleFilter] = useState<string | null>(null);
  const { toast } = useToast();

  // EMR-895 — folder + EMR-896 draft state persisted per patient.
  const stateKey = patientId ?? `name:${patientFirstName}`;
  const [folders, setFolders] = usePersistentState<FolderState>(
    `correspondence:folders:${stateKey}`,
    { archived: [], trashed: {} },
  );
  const [drafts, setDrafts] = usePersistentState<ComposerPayload[]>(
    `correspondence:drafts:${stateKey}`,
    [],
  );

  // Prune trash older than 30 days on mount/update.
  useEffect(() => {
    const now = Date.now();
    const fresh: Record<string, string> = {};
    let changed = false;
    for (const [id, ts] of Object.entries(folders.trashed)) {
      if (now - new Date(ts).getTime() < TRASH_RETENTION_MS) {
        fresh[id] = ts;
      } else {
        changed = true;
      }
    }
    if (changed) setFolders((prev) => ({ ...prev, trashed: fresh }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders.trashed]);

  const draftThreadIds = useMemo(
    () => new Set(drafts.map((d) => `draft:${d.subject}`)),
    [drafts],
  );

  const archivedSet = useMemo(
    () => new Set(folders.archived),
    [folders.archived],
  );
  const trashedSet = useMemo(
    () => new Set(Object.keys(folders.trashed)),
    [folders.trashed],
  );

  const visibleThreads = useMemo(() => {
    const inFolder = threads.filter((t) => {
      if (folder === "trash") return trashedSet.has(t.id);
      if (folder === "archive")
        return archivedSet.has(t.id) && !trashedSet.has(t.id);
      // inbox: not archived, not trashed
      return !archivedSet.has(t.id) && !trashedSet.has(t.id);
    });
    // EMR-895 — when a bubble filter is active, show only matching threads.
    // Keep newest-first to match the unfiltered inbox order (threads arrive
    // sorted by lastMessageAt desc) so toggling a filter doesn't flip the
    // list upside-down on the clinician.
    if (!bubbleFilter) return inFolder;
    return inFolder
      .filter((t) => threadFilterKeys(t).includes(bubbleFilter))
      .sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() -
          new Date(a.lastMessageAt).getTime(),
      );
  }, [threads, folder, archivedSet, trashedSet, bubbleFilter]);

  // EMR-895 — toggle a bubble filter; clicking the active one clears it.
  function toggleBubbleFilter(key: string) {
    setBubbleFilter((cur) => (cur === key ? null : key));
    setActiveThreadId(null);
  }

  // Human-readable label for the active filter chip.
  const filterLabel = bubbleFilter
    ? bubbleFilter.startsWith("urgency:")
      ? bubbleFilter.slice("urgency:".length)
      : bubbleFilter.startsWith("beige:")
        ? bubbleFilter.slice("beige:".length)
        : "Meds"
    : null;

  const activeThread = visibleThreads.find((t) => t.id === activeThreadId) ?? null;

  function archive(id: string) {
    setFolders((prev) => ({
      ...prev,
      archived: prev.archived.includes(id)
        ? prev.archived
        : [...prev.archived, id],
    }));
    toast({ title: "Archived", variant: "success" });
    if (activeThreadId === id) setActiveThreadId(null);
  }

  function trash(id: string) {
    setFolders((prev) => ({
      ...prev,
      trashed: { ...prev.trashed, [id]: new Date().toISOString() },
    }));
    toast({ title: "Moved to trash (30-day retention)", variant: "success" });
    if (activeThreadId === id) setActiveThreadId(null);
  }

  function restore(id: string) {
    setFolders((prev) => {
      const trashed = { ...prev.trashed };
      delete trashed[id];
      return {
        archived: prev.archived.filter((x) => x !== id),
        trashed,
      };
    });
    toast({ title: "Restored to inbox", variant: "success" });
  }

  function saveDraft(payload: ComposerPayload) {
    setDrafts((prev) => [payload, ...prev]);
    setComposing(false);
    toast({ title: "Saved as draft", variant: "success" });
  }

  function sendComposed(payload: ComposerPayload) {
    // No new server thread is created here (no schema/route change); the
    // composed message is recorded as a draft and surfaced in the inbox.
    setDrafts((prev) => [payload, ...prev]);
    setComposing(false);
    toast({
      title: `Message to ${fullName(payload.to)} queued`,
      variant: "success",
    });
  }

  if (threads.length === 0 && drafts.length === 0 && !composing) {
    return (
      <EmptyState
        title="No messages with this patient yet"
        description="Start a conversation to coordinate care, share updates, or answer questions."
        primaryAction={
          <Button size="sm" onClick={() => setComposing(true)}>
            ✉️ New message
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* EMR-896 — patient name returns to the top of the chart. */}
      {patientId && (
        <Link
          href={`/clinic/patients/${patientId}`}
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
        >
          <span aria-hidden="true">←</span>
          {patientFirstName} {patientLastName}
        </Link>
      )}

      <div className="flex flex-col md:flex-row gap-4 min-h-[480px]">
        {/* ── Inbox column ──────────────────────────────────── */}
        <div className="md:w-[320px] shrink-0 space-y-2">
          {/* EMR-896 — button bar with "new" emoji + folder switcher. */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {(["inbox", "archive", "trash"] as FolderName[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFolder(f);
                    setActiveThreadId(null);
                  }}
                  className={`px-2 py-1 text-[11px] rounded-md capitalize ${
                    folder === f
                      ? "bg-accent-soft text-accent font-medium"
                      : "text-text-muted hover:bg-surface-muted"
                  }`}
                >
                  {f === "inbox" ? "📥" : f === "archive" ? "🗄️" : "🗑️"} {f}
                </button>
              ))}
            </div>
            <button
              type="button"
              title="New message"
              aria-label="New message"
              onClick={() => {
                setComposing(true);
                setActiveThreadId(null);
              }}
              className="h-7 w-7 rounded-md bg-accent-soft text-accent hover:bg-accent/15 flex items-center justify-center text-sm"
            >
              <span aria-hidden="true">✉️</span>
            </button>
          </div>

          {/* EMR-895 — active bubble filter indicator. Click ✕ to clear. */}
          {bubbleFilter && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-accent-soft/50 px-2.5 py-1.5">
              <span className="text-[11px] text-text-muted">
                Filtering by{" "}
                <span className="font-medium text-accent">{filterLabel}</span>{" "}
                · chronological
              </span>
              <button
                type="button"
                onClick={() => setBubbleFilter(null)}
                className="text-[11px] text-accent hover:underline"
                aria-label="Clear filter"
              >
                Clear ✕
              </button>
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-y-auto max-h-[720px]">
              {/* Drafts (EMR-896) pinned at the top of the inbox. */}
              {folder === "inbox" &&
                drafts.map((d, i) => (
                  <div
                    key={`draft-${i}`}
                    className="border-b border-border/60 border-l-[3px] border-l-info px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-sm font-medium text-text truncate">
                        {d.subject || "(no subject)"}
                      </p>
                      <span className="text-[11px] text-text-subtle shrink-0">
                        Draft
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <IdentityAvatar
                        seed={d.to.id}
                        name={fullName(d.to)}
                        size="xs"
                      />
                      <span className="text-[11px] text-text-subtle truncate">
                        To {fullName(d.to)}
                      </span>
                      <Bubble tone="info" emoji="✏️">
                        Draft
                      </Bubble>
                    </div>
                  </div>
                ))}

              {visibleThreads.length === 0 && (
                <p className="px-4 py-6 text-xs text-text-subtle text-center">
                  {folder === "trash"
                    ? "Trash is empty."
                    : folder === "archive"
                      ? "No archived threads."
                      : "Inbox is empty."}
                </p>
              )}

              {visibleThreads.map((t) => {
                if (folder === "inbox") {
                  return (
                    <InboxRow
                      key={t.id}
                      thread={t}
                      isActive={t.id === activeThreadId}
                      isDraft={draftThreadIds.has(`draft:${t.subject}`)}
                      bubbleFilter={bubbleFilter}
                      onFilter={toggleBubbleFilter}
                      onSelect={() => {
                        setComposing(false);
                        setActiveThreadId(t.id);
                      }}
                      onArchive={() => archive(t.id)}
                      onTrash={() => trash(t.id)}
                    />
                  );
                }
                // Archive / trash rows: simple, with a Restore action.
                return (
                  <div
                    key={t.id}
                    className="border-b border-border/60 px-4 py-3 flex items-center justify-between gap-2"
                  >
                    <button
                      onClick={() => {
                        setComposing(false);
                        setActiveThreadId(t.id);
                      }}
                      className="text-left min-w-0 flex-1"
                    >
                      <p className="text-sm font-medium text-text truncate">
                        {t.subject}
                      </p>
                      <p className="text-[11px] text-text-subtle">
                        {formatRelative(t.lastMessageAt)}
                      </p>
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => restore(t.id)}
                    >
                      Restore
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* ── Right pane: composer or thread detail ─────────── */}
        {composing ? (
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CorrespondenceComposer
              patientName={`${patientFirstName} ${patientLastName}`}
              onSave={saveDraft}
              onSend={sendComposed}
              onCancel={() => setComposing(false)}
            />
          </Card>
        ) : (
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
              <ThreadDetail
                thread={activeThread}
                currentUserId={currentUserId}
                patientFirstName={patientFirstName}
                patientLastName={patientLastName}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-text-muted">
                  Select a conversation to view messages
                </p>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

/* ── Thread detail (right pane) ───────────────────────────────── */

function ThreadDetail({
  thread,
  currentUserId,
  patientFirstName,
  patientLastName,
}: {
  thread: SerializedThread;
  currentUserId: string;
  patientFirstName: string;
  patientLastName: string;
}) {
  // EMR-895 — "Cindy's Summary" as ~2 bullets.
  const cindy = cindyListSummary(
    thread.triageSummary
      ? [{ title: thread.triageSummary }]
      : thread.messages
          .slice(0, 4)
          .map((m) => ({ title: m.body, meta: formatRelative(m.createdAt) })),
    { voice: "summary", noun: "messages", maxBullets: 2 },
  );

  return (
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
              {thread.subject}
            </h3>
            <p className="text-xs text-text-muted">
              {patientFirstName} {patientLastName} &middot;{" "}
              {thread.messages.length} message
              {thread.messages.length !== 1 ? "s" : ""}
              {/* EMR-895 — keep the date, no "triaged" wording. */}
              {thread.triagedAt && (
                <> &middot; {formatRelative(thread.triagedAt)}</>
              )}
            </p>
          </div>
        </div>

        {/* Triage bubbles */}
        {(thread.triageUrgency || thread.triageCategory) && (
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {urgencyBubble(thread.triageUrgency) && (
              <Bubble tone={urgencyBubble(thread.triageUrgency)!.tone}>
                {urgencyBubble(thread.triageUrgency)!.label}
              </Bubble>
            )}
            {thread.triageCategory &&
              MEDS_CATEGORIES.has(thread.triageCategory) && (
                <Bubble tone="info">Meds</Bubble>
              )}
            {thread.triageCategory && BEIGE_TAG[thread.triageCategory] && (
              <Bubble tone="beige">
                {BEIGE_TAG[thread.triageCategory]}
              </Bubble>
            )}
            {thread.triageCategory &&
              !MEDS_CATEGORIES.has(thread.triageCategory) &&
              !BEIGE_TAG[thread.triageCategory] && (
                <Badge tone="neutral" className="text-[10px]">
                  {CATEGORY_LABELS[thread.triageCategory] ??
                    thread.triageCategory}
                </Badge>
              )}
          </div>
        )}

        {/* EMR-895 — "Cindy's Summary" as ~2 bullets. */}
        {(thread.triageSummary || thread.messages.length > 0) && (
          <CindySays analysis={cindy} className="mb-2" />
        )}

        {/* Safety flags — always prominent if present. */}
        {thread.triageSafetyFlags && thread.triageSafetyFlags.length > 0 && (
          <div className="rounded-lg bg-danger/[0.06] border border-danger/30 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-danger mb-1">
              Safety flags — review immediately
            </p>
            <ul className="space-y-0.5">
              {thread.triageSafetyFlags.map((flag, i) => (
                <li key={i} className="text-xs text-danger leading-relaxed">
                  {flag}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Draft-ready banner. */}
      {(() => {
        const pendingDrafts = thread.messages.filter(
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

      {/* Messages (chronological). */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {[...thread.messages].reverse().map((msg) => {
          const isOwn = msg.senderUserId === currentUserId;
          const senderName = isOwn
            ? "You"
            : msg.sender
              ? `${msg.sender.firstName} ${msg.sender.lastName}`
              : msg.senderAgent
                ? msg.senderAgent.split(":")[0] ?? "AI Assistant"
                : `${patientFirstName} ${patientLastName}`;

          // EMR-897 — fixed identity colour + emoji avatar for human senders.
          const identitySeed =
            msg.senderUserId ??
            (msg.sender ? `${msg.sender.firstName} ${msg.sender.lastName}` : null);

          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex gap-2.5 max-w-[80%] ${isOwn ? "flex-row-reverse" : "flex-row"}`}
              >
                {!isOwn &&
                  (msg.aiDrafted ? (
                    <Avatar
                      firstName={msg.sender?.firstName ?? patientFirstName}
                      lastName={msg.sender?.lastName ?? patientLastName}
                      size="sm"
                      className="mt-1 shrink-0"
                    />
                  ) : identitySeed ? (
                    <span className="mt-1 shrink-0">
                      <IdentityAvatar seed={identitySeed} name={senderName} />
                    </span>
                  ) : (
                    <Avatar
                      firstName={msg.sender?.firstName ?? patientFirstName}
                      lastName={msg.sender?.lastName ?? patientLastName}
                      size="sm"
                      className="mt-1 shrink-0"
                    />
                  ))}
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

      {/* Reply compose bar. */}
      <InlineReplyCompose threadId={thread.id} />
    </>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

/** EMR-895 — a full ~12-word summary with NO "…" truncation. Prefers the
 *  triage summary, falls back to the latest message body. */
function fullSummary(thread: SerializedThread): string {
  const source =
    thread.triageSummary?.trim() || thread.messages[0]?.body?.trim() || "";
  if (!source) return "No summary yet.";
  const words = source.split(/\s+/);
  if (words.length <= 14) return source;
  // Trim to ~12 words at a natural boundary; no ellipsis (per directive).
  return words.slice(0, 12).join(" ");
}
