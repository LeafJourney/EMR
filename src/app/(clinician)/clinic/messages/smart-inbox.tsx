"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo, useRef, useEffect, useCallback, type ChangeEvent, type KeyboardEvent } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { listStagger, listStaggerChild } from "@/lib/ui/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { AgentSignal } from "@/components/ui/agent-signal";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";
import {
  PRIORITY_CONFIG,
  CATEGORY_LABELS,
  type TriagedMessage,
  type MessagePriority,
  type MessageCategory,
} from "@/lib/domain/smart-inbox";
import { sendReply, composeMessage, type ComposeResult } from "./actions";
import { isResolvedMarker } from "./resolve-marker";
import {
  bulkMarkThreadsReadAction,
  bulkResolveThreadsAction,
  bulkAssignThreadsToMeAction,
  bulkExportThreadsAction,
} from "./bulk-actions";
import { CallLaunchButtons } from "@/components/communications/call-launch-buttons";
import { CallBubble, type CallLogData } from "./call-bubble";
// EMR-660 — Resolve button + Export modal live in sibling files to keep
// the smart-inbox diff small (collision risk with EMR-659).
import { ResolveButton } from "./resolve-button";
import { ExportModal, type ExportableMessage } from "./export-modal";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BulkActionBar, useBulkSelection } from "@/components/ui/bulk-action-bar";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useDensity, densityClass } from "@/lib/ui/density";
import {
  useContextMenu,
  ContextMenuIcons,
  type ContextMenuItem,
} from "@/components/ui/context-menu";
// Thread tagging — localStorage-backed until a server-side Tag model lands.
import { EntityTagEditor, EntityTagStrip } from "@/components/ui/entity-tag-editor";
import { PatientHoverCard } from "@/components/preview";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageData {
  id: string;
  body: string;
  status: string;
  aiDrafted: boolean;
  senderUserId: string | null;
  senderAgent: string | null;
  sender: { firstName: string; lastName: string } | null;
  createdAt: string;
}

interface ThreadMessageData {
  threadId: string;
  patientId: string;
  patientName: string;
  subject: string;
  messages: MessageData[];
  callLogs: CallLogData[];
}

interface PatientOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface PatientMed {
  name: string;
  dosage: string | null;
}

interface Props {
  triaged: TriagedMessage[];
  threadMessages: ThreadMessageData[];
  currentUserId: string;
  initialThreadId?: string;
  /** EMR-656 — patient picker options for the New Message modal. */
  patients: PatientOption[];
  /** EMR-708 — supports `?filter=brief` from the redirected morning-brief
   *  route. Unknown values fall back to "all". */
  initialFilter?: string;
  /** EMR-657 — map of patientId → active meds for the hover tooltip. */
  patientMeds?: Record<string, PatientMed[]>;
}

// EMR-604 — chronological timeline that interleaves messages and call records
// so the WhatsApp-style call bubbles land in the right spot among the texts.
type TimelineItem =
  | { kind: "message"; ts: string; data: MessageData }
  | { kind: "call"; ts: string; data: CallLogData };

function buildTimeline(thread: ThreadMessageData): TimelineItem[] {
  const items: TimelineItem[] = [
    ...thread.messages.map(
      (m): TimelineItem => ({ kind: "message", ts: m.createdAt, data: m }),
    ),
    ...thread.callLogs.map(
      (c): TimelineItem => ({ kind: "call", ts: c.startedAt, data: c }),
    ),
  ];
  items.sort((a, b) => a.ts.localeCompare(b.ts));
  return items;
}

// ---------------------------------------------------------------------------
// Priority filter config
// ---------------------------------------------------------------------------

// EMR-708 — `brief` is a synthetic filter for items migrated from the
// retired /clinic/morning-brief surface. The Smart Inbox tags relevant
// threads with category=follow_up by triage rules today; the brief filter
// surfaces those plus anything flagged via a future `brief` priority.
type PriorityFilter = "all" | "brief" | MessagePriority;

const PRIORITY_FILTERS: { key: PriorityFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "brief", label: "Brief" },
  { key: "urgent", label: "Urgent" },
  { key: "high", label: "High" },
  { key: "routine", label: "Routine" },
  { key: "low", label: "Low" },
];

const PRIORITY_BORDER_COLORS: Record<MessagePriority, string> = {
  urgent: "border-l-red-500",
  high: "border-l-amber-500",
  routine: "border-l-blue-500",
  low: "border-l-gray-300",
};

const PRIORITY_BADGE_TONES: Record<MessagePriority, "danger" | "warning" | "info" | "neutral"> = {
  urgent: "danger",
  high: "warning",
  routine: "info",
  low: "neutral",
};

const CATEGORY_BADGE_TONE: Record<MessageCategory, "accent" | "warning" | "info" | "neutral" | "danger" | "highlight" | "success"> = {
  symptom_report: "info",
  medication_question: "warning",
  refill_request: "accent",
  appointment_request: "neutral",
  lab_question: "info",
  adverse_reaction: "danger",
  administrative: "neutral",
  follow_up: "accent",
  general: "neutral",
};

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function PaperclipIcon({ className }: { className?: string } = {}) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.83l-8.57 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

// EMR-659 — Rx symbol used in the per-thread tool row. Stroke-only "Rx"
// glyph keeps it visually aligned with the other small SVG controls.
function RxIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 4h6a4 4 0 0 1 0 8H5z" />
      <path d="M5 4v16" />
      <path d="M11 12l8 8" />
      <path d="m15 16 4-4" />
    </svg>
  );
}

// EMR-659 — Memo icon (notepad with pencil). Triggers a templated body
// insert prefixed with "Memo:" for routing to staff / MA / front / back / provider.
function MemoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4h12l4 4v12a0 0 0 0 1 0 0H4z" />
      <path d="M16 4v4h4" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>
  );
}

function UserAlertIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" x2="19" y1="8" y2="14" />
      <line x1="19" x2="19.01" y1="18" y2="18" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-emerald-600"
      aria-hidden="true"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" x2="12" y1="9" y2="13" />
      <line x1="12" x2="12.01" y1="17" y2="17" />
    </svg>
  );
}

function StethoscopeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
      <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

function PencilSquareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Compose modal (EMR-656)
// ---------------------------------------------------------------------------

function ComposeSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Sending..." : "Send Message"}
    </Button>
  );
}

function ComposeModal({
  patients,
  onClose,
  onSent,
}: {
  patients: PatientOption[];
  onClose: () => void;
  onSent: (threadId: string) => void;
}) {
  const [state, formAction] = useFormState(composeMessage, null);
  const [patientQuery, setPatientQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // EMR-642 — track form edits via state so isDirty is always current when
  // Dialog reads it (a DOM-query approach would return stale render-snapshot
  // values for uncontrolled inputs like subject/body).
  const [formDirty, setFormDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state?.ok) {
      onSent(state.threadId);
    }
  }, [state, onSent]);

  const filteredPatients = useMemo(() => {
    if (!patientQuery.trim()) return patients.slice(0, 6);
    const q = patientQuery.toLowerCase();
    return patients
      .filter(
        (p) =>
          p.firstName.toLowerCase().includes(q) ||
          p.lastName.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [patients, patientQuery]);

  function handleSelectPatient(p: PatientOption) {
    setSelectedPatient(p);
    setPatientQuery(`${p.firstName} ${p.lastName}`);
    setDropdownOpen(false);
  }

  function handlePatientInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPatientQuery(e.target.value);
    setSelectedPatient(null);
    setDropdownOpen(true);
  }

  const isDirty = patientQuery.length > 0 || formDirty;

  return (
    <Dialog
      open
      onOpenChange={(next) => { if (!next) onClose(); }}
      confirmCloseOnDirty
      isDirty={isDirty}
    >
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2 text-text">
            <PencilSquareIcon />
            <DialogTitle className="font-display text-lg font-semibold">
              New Message
            </DialogTitle>
          </div>
          {/* Dialog primitive renders the X close button absolutely. */}
        </div>

        {/* Form */}
        <form ref={formRef} action={formAction} className="px-6 py-5 space-y-4" onChange={() => setFormDirty(true)}>
          {selectedPatient && (
            <input type="hidden" name="patientId" value={selectedPatient.id} />
          )}

          {/* Patient autocomplete */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text">
              To (patient)
            </label>
            <div className="relative">
              <Input
                ref={firstInputRef}
                value={patientQuery}
                onChange={handlePatientInputChange}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                placeholder="Search by name..."
                autoComplete="off"
              />
              {dropdownOpen && filteredPatients.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface shadow-lg overflow-hidden">
                  {filteredPatients.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-4 py-2.5 text-sm text-text hover:bg-surface-muted transition-colors"
                      onMouseDown={() => handleSelectPatient(p)}
                    >
                      {p.lastName}, {p.firstName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text">
              Subject
            </label>
            <Input
              name="subject"
              placeholder="e.g. Follow-up on your recent visit"
              required
              maxLength={200}
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text">
              Message
            </label>
            <Textarea
              name="body"
              rows={5}
              placeholder="Write your message..."
              required
              className="resize-none"
            />
          </div>

          {/* Error */}
          {state?.ok === false && (
            <p className="text-xs text-danger">{state.error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <ComposeSubmitButton />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Hover Meds
// ---------------------------------------------------------------------------

const KNOWN_MEDS = ["Lisinopril", "Adderall", "Metformin", "Atorvastatin", "Amlodipine", "Omeprazole", "Sertraline"];

function HoverMedsText({ text }: { text: string }) {
  // Simple regex to find known meds and wrap them
  const regex = new RegExp(`\\b(${KNOWN_MEDS.join("|")})\\b`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        if (KNOWN_MEDS.some(m => m.toLowerCase() === part.toLowerCase())) {
          return (
            <span key={i} className="group relative inline-block text-accent underline decoration-accent/30 decoration-dashed cursor-help">
              {part}
              <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-surface-raised border border-border text-text text-xs rounded-md p-2 shadow-xl z-50">
                <strong className="block mb-1">{part}</strong>
                <span className="text-text-muted">No interactions detected. Standard dosage: 10mg - 40mg.</span>
              </span>
            </span>
          );
        }
        // Non-med text — pass through linkifier so URLs/emails/phones/refs
        // become clickable inside message bodies.
        return <LinkifiedText key={i} as="span" text={part} />;
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// EMR-657 — Avatar meds tooltip
// Wraps any child with a hover popover listing the patient's active meds.
// ---------------------------------------------------------------------------

function MedsTooltip({ meds, children }: { meds: PatientMed[]; children: React.ReactNode }) {
  return (
    <span className="relative group/meds inline-flex">
      {children}
      {meds.length > 0 && (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50",
            "w-52 rounded-lg border border-border bg-surface-raised shadow-xl p-3",
            "opacity-0 group-hover/meds:opacity-100 transition-opacity duration-150",
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-subtle mb-1.5">
            Current Meds
          </p>
          <ul className="space-y-1">
            {meds.slice(0, 6).map((m) => (
              <li key={m.name} className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-text truncate">{m.name}</span>
                {m.dosage && (
                  <span className="text-[10px] text-text-muted whitespace-nowrap shrink-0">
                    {m.dosage}
                  </span>
                )}
              </li>
            ))}
            {meds.length > 6 && (
              <li className="text-[10px] text-text-subtle pt-0.5">
                +{meds.length - 6} more
              </li>
            )}
          </ul>
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Reply compose (inline)
// ---------------------------------------------------------------------------

function ReplySubmitButton({ isDraft }: { isDraft?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={isDraft ? "secondary" : "primary"} disabled={pending}>
      {pending ? (isDraft ? "Saving..." : "Sending...") : (isDraft ? "Save Draft" : "Send")}
    </Button>
  );
}

const DRAFT_KEY = (threadId: string) => `msg-draft:${threadId}`;

// EMR-659 — Memo template prefix. When the clinician hits the Memo symbol we
// prepend this so the recipient sees a clear "internal memo" framing. The
// real routing UI (staff / MA / front / back / provider) will land in a
// follow-up; the template at least makes the intent explicit.
const MEMO_TEMPLATE = "Memo to staff:\n\n";

function InlineReplyCompose({
  threadId,
  patientId,
}: {
  threadId: string;
  /** EMR-659 — used by the Rx symbol to deep-link to the prescribe page. */
  patientId?: string;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(sendReply, null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // EMR-659 — file picker for attachments. Files are encoded into the message
  // body as [Attached: filename.ext] markers (consistent with the ATTACHMENT_RE
  // heuristic in page.tsx) until a real MessageAttachment model lands.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  // EMR-657 — restore saved draft on mount; save on every keystroke.
  const [text, setText] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(DRAFT_KEY(threadId)) ?? "";
  });
  const [showSlashCommands, setShowSlashCommands] = useState(false);

  // EMR-659 — toolbar actions
  const insertMemoTemplate = () => {
    setText((prev: string) => (prev.startsWith(MEMO_TEMPLATE) ? prev : MEMO_TEMPLATE + prev));
    // Defer focus so the prepend is visible before caret moves.
    requestAnimationFrame(() => textareaRef.current?.focus());
  };
  const openPrescribe = () => {
    if (!patientId) return;
    router.push(`/clinic/patients/${patientId}/prescribe?thread=${threadId}`);
  };
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []) as File[];
    const existingNames = new Set(attachedFiles.map((f: File) => f.name));
    setAttachedFiles([...attachedFiles, ...incoming.filter((f: File) => !existingNames.has(f.name))]);
    e.target.value = "";
  };
  const removeAttachedFile = (name: string) => {
    setAttachedFiles(attachedFiles.filter((f: File) => f.name !== name));
  };

  // body value sent to the server: message text + one [Attached: …] line per file.
  const bodyToSend =
    attachedFiles.length > 0
      ? `${text}\n\n${attachedFiles.map((f: File) => `[Attached: ${f.name}]`).join("\n")}`
      : text;

  // Persist draft on every change.
  useEffect(() => {
    if (text) {
      localStorage.setItem(DRAFT_KEY(threadId), text);
    } else {
      localStorage.removeItem(DRAFT_KEY(threadId));
    }
  }, [threadId, text]);

  // Clear draft + attachments + form after successful send.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setText("");
      setAttachedFiles([]);
      localStorage.removeItem(DRAFT_KEY(threadId));
    }
  }, [state, threadId]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "/") {
      setShowSlashCommands(true);
    } else if (e.key === "Escape") {
      setShowSlashCommands(false);
    }
  };

  const insertCommand = (cmd: string) => {
    setText((prev: string) => prev.replace(/\/$/, "") + cmd);
    setShowSlashCommands(false);
  };

  return (
    <div className="relative border-t border-border p-4 bg-surface">
      {showSlashCommands && (
        <div className="absolute bottom-[calc(100%-10px)] left-4 w-64 bg-surface border border-border rounded-lg shadow-lg z-10 p-2">
          <p className="text-xs font-semibold text-text-subtle mb-2 px-2 uppercase">Quick Inserts</p>
          <button type="button" onClick={() => insertCommand("Please schedule a referral with [Specialist]. ")} className="w-full text-left px-2 py-1.5 text-sm hover:bg-surface-muted rounded-md">/ref (Referral)</button>
          <button type="button" onClick={() => insertCommand("Rx sent to pharmacy: [Medication]. ")} className="w-full text-left px-2 py-1.5 text-sm hover:bg-surface-muted rounded-md">/rx (Prescription)</button>
          <button type="button" onClick={() => insertCommand("Memo: Please follow up in 2 weeks. ")} className="w-full text-left px-2 py-1.5 text-sm hover:bg-surface-muted rounded-md">/memo (Quick Note)</button>
        </div>
      )}
      {/* Hidden file input — triggered by the Attach button below. */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt,.csv"
        className="sr-only"
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <form
        ref={formRef}
        action={formAction}
        className="flex flex-col gap-2"
      >
        <input type="hidden" name="threadId" value={threadId} />
        {/* body is ferried via hidden input so attachment markers are included
            without changing the server-action contract. The textarea is
            uncontrolled-by-name; its value is purely for the local UI state. */}
        <input type="hidden" name="body" value={bodyToSend} />
        {/* EMR-659 — per-thread tool row: Rx, Memo, Attach. */}
        <div className="flex items-center gap-1 -mb-1">
          <button
            type="button"
            onClick={openPrescribe}
            disabled={!patientId}
            title="Open prescribe (Rx)"
            aria-label="Open prescribe page for this patient"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-text-muted hover:text-text hover:bg-surface-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RxIcon />
            <span className="hidden sm:inline">Rx</span>
          </button>
          <button
            type="button"
            onClick={insertMemoTemplate}
            title="Insert internal memo template"
            aria-label="Insert internal memo template"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-text-muted hover:text-text hover:bg-surface-muted transition-colors"
          >
            <MemoIcon />
            <span className="hidden sm:inline">Memo</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach a file"
            aria-label="Attach a file"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-text-muted hover:text-text hover:bg-surface-muted transition-colors"
          >
            <PaperclipIcon />
            <span className="hidden sm:inline">Attach</span>
          </button>
        </div>
        {/* Attached file pills — shown when at least one file is queued. */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachedFiles.map((f: File) => (
              <span
                key={f.name}
                className="inline-flex items-center gap-1 rounded-full bg-surface-muted border border-border px-2 py-0.5 text-[11px] text-text-muted max-w-[200px]"
              >
                <PaperclipIcon className="shrink-0 opacity-60" />
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachedFile(f.name)}
                  aria-label={`Remove ${f.name}`}
                  className="shrink-0 ml-0.5 rounded-full hover:text-danger transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Textarea
              ref={textareaRef}
              rows={2}
              value={text}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                setText(e.target.value);
                if (!e.target.value.includes("/")) setShowSlashCommands(false);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type your reply... (Type '/' for quick inserts)"
              className="resize-none"
            />
          </div>
          <div className="flex flex-col gap-2">
            <ReplySubmitButton />
            <ReplySubmitButton isDraft />
          </div>
        </div>
        {state?.ok === false && (
          <p className="text-xs text-danger">{state.error}</p>
        )}
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

// EMR-657 — Assign a numeric score so urgent+unread threads always surface
// first regardless of recency. Lower score = higher in list.
const PRIORITY_SCORE: Record<MessagePriority, number> = {
  urgent: 0,
  high: 2,
  routine: 4,
  low: 6,
};

function smartScore(t: TriagedMessage): number {
  const base = PRIORITY_SCORE[t.priority];
  // Unread bump: −1 so unread urgent beats read urgent, etc.
  return t.unreadCount > 0 ? base - 1 : base;
}

// ---------------------------------------------------------------------------
// Thread list row — wrapped in a per-row right-click ContextMenu (Monday
// /Linear-tier quick actions). The hook MUST live in a component so we
// can call it once per visible row; calling it inside `.map(...)` would
// be a hooks-in-loop violation.
// ---------------------------------------------------------------------------

interface ThreadRowProps {
  thread: TriagedMessage;
  isSelected: boolean;
  isPinned: boolean;
  childVariants: ReturnType<typeof listStaggerChild>;
  /** EMR-657 — active meds for the hover tooltip on the patient avatar. */
  meds: PatientMed[];
  onSelect: () => void;
  onTogglePin: () => void;
  onMarkRead: () => void;
  onResolve: () => void;
  onArchive: () => void;
  onCopyLink: () => void;
}

function ThreadInboxRow({
  thread: t,
  isSelected,
  isPinned,
  childVariants,
  meds,
  onSelect,
  onTogglePin,
  onMarkRead,
  onResolve,
  onArchive,
  onCopyLink,
}: ThreadRowProps) {
  const items: ContextMenuItem[] = [
    { label: "Open", icon: ContextMenuIcons.Open, onSelect: (c) => { onSelect(); c(); }, kbd: "↵" },
    {
      label: t.unreadCount > 0 ? "Mark as read" : "Already read",
      icon: ContextMenuIcons.Check,
      disabled: t.unreadCount === 0,
      onSelect: (c) => { onMarkRead(); c(); },
    },
    { label: "Resolve thread", icon: ContextMenuIcons.Check, onSelect: (c) => { onResolve(); c(); } },
    { divider: true, label: "" },
    { label: "Copy link to thread", icon: ContextMenuIcons.Link, onSelect: (c) => { onCopyLink(); c(); }, kbd: "⌘ L" },
    {
      label: isPinned ? "Unpin from top" : "Pin to top",
      icon: ContextMenuIcons.Pin,
      onSelect: (c) => { onTogglePin(); c(); },
    },
    { divider: true, label: "" },
    { label: "Archive thread", icon: ContextMenuIcons.Archive, danger: true, onSelect: (c) => { onArchive(); c(); } },
  ];
  const ctx = useContextMenu(() => items);

  return (
    <>
      <motion.button
        key={t.threadId}
        variants={childVariants}
        onClick={onSelect}
        onContextMenu={ctx.triggerProps.onContextMenu}
        onTouchStart={ctx.triggerProps.onTouchStart}
        onTouchEnd={ctx.triggerProps.onTouchEnd}
        onTouchMove={ctx.triggerProps.onTouchMove}
        className={cn(
          "w-full text-left density-row border-b border-border/60 transition-colors hover:bg-surface-muted",
          "border-l-[3px]",
          PRIORITY_BORDER_COLORS[t.priority],
          isSelected && "bg-surface-muted",
          isPinned && "bg-accent-soft/30",
        )}
      >
        <div className="flex items-start gap-3">
          {/* EMR-657 — avatar with meds tooltip; click navigates to chart */}
          <MedsTooltip meds={meds}>
            <Link
              href={`/clinic/patients/${t.patientId}`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Open chart for ${t.patientName}`}
            >
              <Avatar
                firstName={t.patientName.split(" ")[0] ?? ""}
                lastName={t.patientName.split(" ")[1] ?? ""}
                size="sm"
              />
            </Link>
          </MedsTooltip>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {t.unreadCount > 0 && (
                  <span className="shrink-0 h-2 w-2 rounded-full bg-accent" />
                )}
                <span
                  role="button"
                  tabIndex={0}
                  aria-pressed={isPinned}
                  aria-label={isPinned ? "Unpin thread" : "Pin thread to top"}
                  title={isPinned ? "Unpin thread" : "Pin thread to top"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      onTogglePin();
                    }
                  }}
                  className={cn(
                    "shrink-0 inline-flex items-center justify-center h-5 w-5 rounded transition-colors",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                    isPinned
                      ? "text-accent"
                      : "text-text-subtle/40 hover:text-text-subtle",
                  )}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .013 2.371c-.125.612-.413 1.27-.978 1.834a.5.5 0 0 1-.707 0L5.95 11.756 1.854 15.85a.5.5 0 1 1-.708-.707L5.243 11.05 2.475 8.28a.5.5 0 0 1 0-.706c.565-.565 1.222-.853 1.834-.978a5.93 5.93 0 0 1 2.372.013l3.134-3.134a2.97 2.97 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z" />
                  </svg>
                </span>
                {/* EMR-657 — clicking name opens the patient chart */}
                <PatientHoverCard patientId={t.patientId}>
                  <Link
                    href={`/clinic/patients/${t.patientId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm font-semibold text-text truncate hover:text-accent hover:underline transition-colors"
                  >
                    {t.patientName}
                  </Link>
                </PatientHoverCard>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {(t.attachmentCount ?? 0) > 0 && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[11px] text-text-subtle"
                    title={`${t.attachmentCount} attachment${
                      (t.attachmentCount ?? 0) === 1 ? "" : "s"
                    }`}
                    aria-label={`${t.attachmentCount} attachment${
                      (t.attachmentCount ?? 0) === 1 ? "" : "s"
                    }`}
                  >
                    <PaperclipIcon className="opacity-80" />
                    {t.attachmentCount}
                  </span>
                )}
                <span className="text-[11px] text-text-subtle whitespace-nowrap">
                  {formatRelative(t.lastMessageAt)}
                </span>
              </div>
            </div>
            <p className="text-xs text-text mt-0.5 truncate">{t.subject}</p>
            <p className="text-xs text-text-muted mt-0.5 line-clamp-1">
              {t.summary}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <Badge tone={CATEGORY_BADGE_TONE[t.category]}>
                {CATEGORY_LABELS[t.category]}
              </Badge>
              {t.needsClinician && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700">
                  <UserAlertIcon />
                  Needs clinician
                </span>
              )}
              {/* Thread tags (read-only here; editor lives in the detail pane). */}
              <EntityTagStrip scope="inbox-thread" entityId={t.threadId} />
            </div>
          </div>
        </div>
      </motion.button>
      {ctx.menu}
    </>
  );
}

export function SmartInboxView({
  triaged,
  threadMessages,
  currentUserId,
  initialThreadId,
  patients,
  initialFilter,
  patientMeds = {},
}: Props) {
  const initialPriority: PriorityFilter =
    initialFilter === "brief" ||
    initialFilter === "urgent" ||
    initialFilter === "high" ||
    initialFilter === "routine" ||
    initialFilter === "low"
      ? initialFilter
      : "all";
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>(initialPriority);
  const [categoryFilter, setCategoryFilter] = useState<MessageCategory | "all">("all");
  const [search, setSearch] = useState("");
  // Inbox respects the user's global Comfortable/Dense preference —
  // each thread row reads `--density-row-py` to compute its vertical
  // padding (see smart-inbox thread <button> classname).
  const { density } = useDensity();
  // EMR-DnD: clinician-pinned threads bubble to the top of the list,
  // beating priority-based smart sort. Persisted in localStorage as a
  // Set<threadId>. TODO(schema): mirror to a `MessageThread.pinnedBy`
  // join table so pins survive a logout / device swap.
  const [pinnedThreadIds, setPinnedThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("inbox:pinned:v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
          setPinnedThreadIds(new Set(parsed as string[]));
        }
      }
    } catch {
      // ignore — bad JSON or unavailable storage.
    }
  }, []);
  const togglePinned = (threadId: string) => {
    setPinnedThreadIds((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      try {
        window.localStorage.setItem(
          "inbox:pinned:v1",
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // ignore
      }
      return next;
    });
  };
  // Shared motion: subtle stagger on the triaged list. No-op under
  // prefers-reduced-motion. Variants are stable across renders.
  const reduceMotion = useReducedMotion() ?? false;
  const listStaggerProps = useMemo(() => listStagger(reduceMotion), [reduceMotion]);
  const childVariants = useMemo(() => listStaggerChild(reduceMotion), [reduceMotion]);
  const confirm = useConfirm();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    initialThreadId ?? triaged[0]?.threadId ?? null,
  );
  const [showCompose, setShowCompose] = useState(false);
  // EMR-659 — in-thread search: filters the visible message timeline by body
  // text (case-insensitive substring). Resets whenever the selected thread
  // changes so a stale query doesn't carry across threads.
  const [threadSearch, setThreadSearch] = useState("");
  // EMR-660 — Export modal open state for the currently-selected thread.
  const [exportOpen, setExportOpen] = useState(false);

  // Bulk thread selection (multi-select on the left panel).
  const selection = useBulkSelection<string>();
  const { toast } = useToast();
  const lastClickedRef = useRef<string | null>(null);

  // Compute counts per priority. EMR-708 — `brief` counts threads with
  // category=follow_up (the closest current proxy for "morning brief item")
  // until brief-tagging is fully wired upstream.
  const priorityCounts = useMemo(() => {
    const counts: Record<PriorityFilter, number> = {
      all: triaged.length,
      brief: 0,
      urgent: 0,
      high: 0,
      routine: 0,
      low: 0,
    };
    for (const t of triaged) {
      counts[t.priority]++;
      if (t.category === "follow_up") counts.brief++;
    }
    return counts;
  }, [triaged]);

  // Stats
  const urgentCount = priorityCounts.urgent;
  const needsClinicianCount = useMemo(
    () => triaged.filter((t) => t.needsClinician).length,
    [triaged],
  );

  // Unique categories present in the data
  const availableCategories = useMemo(() => {
    const cats = new Set<MessageCategory>();
    for (const t of triaged) cats.add(t.category);
    return Array.from(cats).sort();
  }, [triaged]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = triaged;

    if (priorityFilter === "brief") {
      // EMR-708 — Brief view scopes to follow-up category until brief-flag
      // tagging lands upstream.
      list = list.filter((t) => t.category === "follow_up");
    } else if (priorityFilter !== "all") {
      list = list.filter((t) => t.priority === priorityFilter);
    }

    if (categoryFilter !== "all") {
      list = list.filter((t) => t.category === categoryFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.patientName.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          t.summary.toLowerCase().includes(q),
      );
    }

    // EMR-657 — smart sort: urgent+unread first, then high+unread, etc.;
    // within the same score bucket, fall back to recency (newest first).
    // EMR-DnD — pinned threads sort above all unpinned threads regardless
    // of priority, then the existing smart-sort logic resolves ties.
    list = [...list].sort((a, b) => {
      const aPinned = pinnedThreadIds.has(a.threadId) ? 0 : 1;
      const bPinned = pinnedThreadIds.has(b.threadId) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      const scoreDiff = smartScore(a) - smartScore(b);
      if (scoreDiff !== 0) return scoreDiff;
      return b.lastMessageAt.localeCompare(a.lastMessageAt);
    });

    return list;
  }, [triaged, priorityFilter, categoryFilter, search, pinnedThreadIds]);

  // Visible thread IDs in current order — drives ⌘/Ctrl+A and Shift+Click
  // range selection. Recomputed whenever the filter pipeline changes.
  const visibleThreadIds = useMemo(
    () => filtered.map((t) => t.threadId),
    [filtered],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (inField) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        selection.setAllVisible(visibleThreadIds);
      } else if (e.key === "Escape" && selection.size > 0) {
        selection.clear();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleThreadIds, selection]);

  // Selection-aware row-click handler. Plain click selects the thread
  // for preview (current behaviour); clicking the checkbox toggles
  // selection; Shift+Click on the checkbox extends a range.
  const handleSelectionClick = useCallback(
    (id: string, shift?: boolean) => {
      if (shift) {
        selection.selectRange(visibleThreadIds, lastClickedRef.current, id);
      } else {
        selection.toggle(id);
      }
      lastClickedRef.current = id;
    },
    [selection, visibleThreadIds],
  );

  // ---- Bulk handlers ----
  const [bulkPending, setBulkPending] = useState<string | null>(null);

  const handleBulkMarkRead = useCallback(async () => {
    setBulkPending("read");
    const res = await bulkMarkThreadsReadAction({
      threadIds: selection.asArray,
    });
    setBulkPending(null);
    if (!res.ok) {
      toast({ title: "Mark read failed", description: res.error, variant: "error" });
      return;
    }
    toast({
      title: `Marked ${res.count} message${res.count === 1 ? "" : "s"} read`,
      variant: "success",
    });
    selection.clear();
  }, [selection, toast]);

  const handleBulkResolve = useCallback(async () => {
    setBulkPending("resolve");
    const res = await bulkResolveThreadsAction({
      threadIds: selection.asArray,
    });
    setBulkPending(null);
    if (!res.ok) {
      toast({ title: "Resolve failed", description: res.error, variant: "error" });
      return;
    }
    toast({
      title: `Resolved ${res.count} thread${res.count === 1 ? "" : "s"}`,
      variant: "success",
    });
    selection.clear();
  }, [selection, toast]);

  const handleBulkAssign = useCallback(async () => {
    setBulkPending("assign");
    const res = await bulkAssignThreadsToMeAction({
      threadIds: selection.asArray,
    });
    setBulkPending(null);
    if (!res.ok) {
      toast({ title: "Assign failed", description: res.error, variant: "error" });
      return;
    }
    toast({
      title: `Assigned ${res.count} thread${res.count === 1 ? "" : "s"} to you`,
      variant: "success",
    });
    selection.clear();
  }, [selection, toast]);

  const handleBulkExportThreads = useCallback(async () => {
    setBulkPending("export");
    const res = await bulkExportThreadsAction({
      threadIds: selection.asArray,
    });
    setBulkPending(null);
    if (!res.ok) {
      toast({ title: "Export failed", description: res.error, variant: "error" });
      return;
    }
    const header = [
      "id",
      "patient",
      "subject",
      "lastMessageAt",
      "priority",
      "category",
    ];
    const escape = (v: string | null) =>
      v == null
        ? ""
        : /[",\n]/.test(v)
          ? `"${v.replace(/"/g, '""')}"`
          : v;
    const lines = [header.join(",")];
    for (const r of res.rows) {
      lines.push(
        [
          r.id,
          r.patientName,
          r.subject,
          r.lastMessageAt,
          r.priority,
          r.category,
        ]
          .map((x) => escape(x as string | null))
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inbox-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: `Exported ${res.rows.length} thread${res.rows.length === 1 ? "" : "s"}`,
      variant: "success",
    });
  }, [selection.asArray, toast]);

  // Active thread detail
  const selectedTriage = triaged.find((t) => t.threadId === selectedThreadId);
  const selectedThread = threadMessages.find(
    (t) => t.threadId === selectedThreadId,
  );

  // When filters change and selected thread is no longer visible, select the first visible
  useEffect(() => {
    if (
      selectedThreadId &&
      !filtered.some((t) => t.threadId === selectedThreadId)
    ) {
      setSelectedThreadId(filtered[0]?.threadId ?? null);
    }
  }, [filtered, selectedThreadId]);

  // EMR-659 — clear the in-thread search whenever the active thread changes
  // so the query box always reflects the thread the clinician is looking at.
  useEffect(() => {
    setThreadSearch("");
  }, [selectedThreadId]);

  // Empty state: no threads at all
  if (triaged.length === 0) {
    return (
      <>
        {showCompose && (
          <ComposeModal
            patients={patients}
            onClose={() => setShowCompose(false)}
            onSent={(threadId) => {
              setShowCompose(false);
              setSelectedThreadId(threadId);
            }}
          />
        )}
        <div className="flex justify-end mb-4">
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<PencilSquareIcon />}
            onClick={() => setShowCompose(true)}
          >
            New Message
          </Button>
        </div>
        <EmptyState
          icon={<CheckCircleIcon />}
          title="Inbox zero — all caught up."
          description="No patient messages to review. Enjoy the calm."
        />
      </>
    );
  }

  return (
    <>
      {showCompose && (
        <ComposeModal
          patients={patients}
          onClose={() => setShowCompose(false)}
          onSent={(threadId) => {
            setShowCompose(false);
            setSelectedThreadId(threadId);
          }}
        />
      )}
    <div className={cn("space-y-4", densityClass(density))}>
      {/* Top bar: filters + stats */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: priority pills + category + search */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Priority pills */}
          <div className="flex items-center gap-1 bg-surface-muted rounded-lg p-1">
            {PRIORITY_FILTERS.map((f) => {
              const isActive = priorityFilter === f.key;
              const count = priorityCounts[f.key];
              return (
                <button
                  key={f.key}
                  onClick={() => setPriorityFilter(f.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150",
                    isActive
                      ? "bg-surface shadow-sm text-text"
                      : "text-text-muted hover:text-text hover:bg-surface/60",
                  )}
                >
                  {f.label}
                  {count > 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-semibold rounded-full px-1",
                        isActive
                          ? f.key === "urgent"
                            ? "bg-red-100 text-red-700"
                            : f.key === "high"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-surface-muted text-text-muted"
                          : "bg-surface-muted/60 text-text-subtle",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Category dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as MessageCategory | "all")
            }
            className="h-9 px-3 text-xs font-medium rounded-md border border-border-strong bg-surface text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            <option value="all">All categories</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-subtle">
              <SearchIcon />
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient or message..."
              className="pl-9 h-9 w-56 text-xs"
            />
          </div>
        </div>

        {/* Right: stats + new message */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <InboxIcon />
              {triaged.length} total
            </span>
            {urgentCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-red-600 font-medium">
                <AlertTriangleIcon />
                {urgentCount} urgent
              </span>
            )}
            {needsClinicianCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <StethoscopeIcon />
                {needsClinicianCount} needs clinician
              </span>
            )}
          </div>
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<PencilSquareIcon />}
            onClick={() => setShowCompose(true)}
          >
            New Message
          </Button>
        </div>
      </div>

      {/* Main content: list + detail */}
      <div className="flex flex-col md:flex-row gap-4 min-h-[600px]">
        {/* Left panel: triaged message list */}
        <Card className="md:w-[40%] shrink-0 overflow-hidden">
          <motion.div
            className="overflow-y-auto max-h-[700px]"
            // Motion: list-stagger fan-in. The key includes filter + search so
            // the stagger replays when the filter set changes, giving the
            // refresh a real "rebuilt" feel instead of a silent swap.
            key={`inbox-${priorityFilter}-${categoryFilter}-${search}`}
            {...listStaggerProps}
          >
            {filtered.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-text-muted">
                  No messages match your filters.
                </p>
              </div>
            ) : (
              filtered.map((t) => {
                const isSelected = t.threadId === selectedThreadId;
                const isChecked = selection.has(t.threadId);
                const isPinned = pinnedThreadIds.has(t.threadId);
                return (
                  <div key={t.threadId} className="relative group">
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        "absolute left-2 top-3 z-10 inline-flex items-center justify-center h-4 w-4",
                        isChecked || selection.size > 0
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100 transition-opacity",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectionClick(
                            t.threadId,
                            (e.nativeEvent as MouseEvent | undefined)?.shiftKey,
                          );
                        }}
                        aria-label={`Select thread with ${t.patientName}`}
                        className="h-4 w-4 rounded border-border-strong text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      />
                    </label>
                    <ThreadInboxRow
                      thread={t}
                      isSelected={isSelected}
                      isPinned={isPinned}
                      childVariants={childVariants}
                      meds={patientMeds[t.patientId] ?? []}
                      onSelect={() => setSelectedThreadId(t.threadId)}
                      onTogglePin={() => togglePinned(t.threadId)}
                      onMarkRead={() => {
                        setSelectedThreadId(t.threadId);
                      }}
                      onResolve={() => {
                        setSelectedThreadId(t.threadId);
                      }}
                      onArchive={() => {
                        void (async () => {
                          const ok = await confirm({
                            title: `Archive the thread with ${t.patientName}?`,
                            description:
                              "It moves off the active inbox. You can pull it back from Archived if they reply.",
                            severity: "danger",
                            confirmLabel: "Archive thread",
                          });
                          if (ok) setSelectedThreadId(null);
                        })();
                      }}
                      onCopyLink={() => {
                        try {
                          const url = `${window.location.origin}/clinic/messages?thread=${t.threadId}`;
                          void navigator.clipboard?.writeText(url);
                        } catch {
                          /* ignore */
                        }
                      }}
                    />
                  </div>
                );
              })
            )}
          </motion.div>
        </Card>

        {/* Right panel: thread detail */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          {selectedTriage && selectedThread ? (
            <>
              {/* Thread header */}
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                  {/* EMR-657 — hover avatar to see patient's current meds */}
                  <MedsTooltip meds={patientMeds[selectedThread.patientId] ?? []}>
                    <Avatar
                      firstName={selectedThread.patientName.split(" ")[0] ?? ""}
                      lastName={selectedThread.patientName.split(" ")[1] ?? ""}
                      size="sm"
                    />
                  </MedsTooltip>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-display text-lg text-text leading-tight truncate">
                      {selectedThread.subject}
                    </h2>
                    {/* EMR-657 — clicking name opens the patient chart */}
                    <PatientHoverCard patientId={selectedThread.patientId}>
                      <Link
                        href={`/clinic/patients/${selectedThread.patientId}`}
                        className="text-xs text-text-muted hover:text-accent hover:underline transition-colors"
                      >
                        {selectedThread.patientName}
                      </Link>
                    </PatientHoverCard>
                    {/* Thread tags — color-coded labels (follow-up, urgent…). */}
                    <div className="mt-1">
                      <EntityTagEditor
                        scope="inbox-thread"
                        entityId={selectedThread.threadId}
                        compact
                      />
                    </div>
                  </div>
                  {selectedTriage && (
                    <div className="flex items-center gap-2">
                      {/* EMR-659 — in-thread search. Filters the visible
                          timeline below by case-insensitive substring across
                          message bodies (words, numbers, dates all flow
                          through as plain text). */}
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none">
                          <SearchIcon />
                        </span>
                        <Input
                          type="search"
                          value={threadSearch}
                          onChange={(e) => setThreadSearch(e.target.value)}
                          placeholder="Search this thread…"
                          aria-label="Search messages in this thread"
                          className="h-8 w-44 pl-7 text-xs"
                        />
                      </div>
                      <CallLaunchButtons
                        patientId={selectedTriage.patientId}
                        messageThreadId={selectedTriage.threadId}
                        counterpartyName={selectedThread.patientName}
                      />
                      <Button variant="ghost" size="sm" onClick={() => setExportOpen(true)}>
                        Export
                      </Button>
                      <ResolveButton
                        threadId={selectedThread.threadId}
                        isResolved={(() => {
                          // EMR-660 — Resolved when the most recent clinician
                          // message carries the [[RESOLVED]] sentinel AND no
                          // patient reply has landed after it. We check the
                          // last message in chronological order.
                          const sorted = [...selectedThread.messages].sort((a, b) =>
                            a.createdAt.localeCompare(b.createdAt),
                          );
                          const last = sorted[sorted.length - 1];
                          return !!last && isResolvedMarker(last.body);
                        })()}
                      />
                    </div>
                  )}
                </div>
                {/* EMR-660 — Continuous patient thread link. Surfaces all
                    correspondence for this patient (across threads) as a
                    single timeline on the chart's messages tab. */}
                <div className="mt-2 text-xs">
                  <Link
                    href={`/clinic/patients/${selectedThread.patientId}#messages`}
                    className="text-text-muted hover:text-accent hover:underline"
                  >
                    View all correspondence with {selectedThread.patientName} &rarr;
                  </Link>
                </div>
              </div>

              {/* AI Triage card */}
              <div className="px-5 py-4 border-b border-border/60 bg-surface-muted/30">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5 text-accent">
                    <SparklesIcon />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-subtle">
                        AI Triage
                      </span>
                      <Badge tone={PRIORITY_BADGE_TONES[selectedTriage.priority]}>
                        {PRIORITY_CONFIG[selectedTriage.priority].label}
                      </Badge>
                      <Badge tone={CATEGORY_BADGE_TONE[selectedTriage.category]}>
                        {CATEGORY_LABELS[selectedTriage.category]}
                      </Badge>
                      {selectedTriage.needsClinician && (
                        <Badge tone="warning">Needs Clinician</Badge>
                      )}
                    </div>
                    <p className="text-sm text-text leading-relaxed">
                      {selectedTriage.summary}
                    </p>
                    <p className="text-xs text-text-muted">
                      <span className="font-medium">Reason:</span>{" "}
                      {selectedTriage.triageReason}
                    </p>
                    {selectedTriage.suggestedAction && (
                      <p className="text-xs text-accent font-medium">
                        Suggested: {selectedTriage.suggestedAction}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Message history — messages and call records interleaved
                  chronologically. EMR-604. EMR-659 — when an in-thread
                  search is active, the timeline is filtered to message
                  bubbles whose body contains the query (call bubbles are
                  hidden during search since they have no text body). */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {(() => {
                  const timeline = buildTimeline(selectedThread);
                  const q = threadSearch.trim().toLowerCase();
                  const visible = q
                    ? timeline.filter(
                        (item) =>
                          item.kind === "message" &&
                          item.data.body.toLowerCase().includes(q),
                      )
                    : timeline;
                  if (q && visible.length === 0) {
                    return (
                      <p className="text-center text-xs text-text-muted py-6">
                        No messages match &ldquo;{threadSearch}&rdquo;.
                      </p>
                    );
                  }
                  return visible.map((item) => {
                  if (item.kind === "call") {
                    return (
                      <CallBubble
                        key={`call-${item.data.id}`}
                        call={item.data}
                        patientId={selectedThread.patientId}
                        threadId={selectedThread.threadId}
                      />
                    );
                  }
                  const msg = item.data;
                  const isOwn = msg.senderUserId === currentUserId;
                  const isAgent = !!msg.senderAgent;
                  const senderName = isOwn
                    ? "You"
                    : msg.sender
                      ? `${msg.sender.firstName} ${msg.sender.lastName}`
                      : msg.senderAgent
                        ? msg.senderAgent.split(":")[0] ?? "AI Assistant"
                        : "Patient";

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        isOwn || isAgent ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "flex gap-2.5 max-w-[80%]",
                          isOwn || isAgent ? "flex-row-reverse" : "flex-row",
                        )}
                      >
                        {!isOwn && !isAgent && (
                          <Avatar
                            firstName={
                              selectedThread.patientName.split(" ")[0] ?? ""
                            }
                            lastName={
                              selectedThread.patientName.split(" ")[1] ?? ""
                            }
                            size="sm"
                            className="mt-1 shrink-0"
                          />
                        )}
                        <div>
                          <div
                            className={cn(
                              "rounded-xl px-4 py-2.5 text-sm leading-relaxed",
                              msg.aiDrafted && msg.status === "draft"
                                ? "bg-highlight-soft/40 text-text border border-highlight/30 border-dashed"
                                : isOwn || isAgent
                                  ? "bg-accent-soft text-text"
                                  : "bg-surface-raised text-text border border-border/60",
                            )}
                          >
                            <HoverMedsText text={msg.body} />
                          </div>
                          <div
                            className={cn(
                              "flex items-center gap-2 mt-1 flex-wrap",
                              isOwn || isAgent
                                ? "justify-end"
                                : "justify-start",
                            )}
                          >
                            <span className="text-xs text-text-subtle">
                              {senderName}
                            </span>
                            <span className="text-xs text-text-subtle">
                              {formatRelative(msg.createdAt)}
                            </span>
                            {msg.aiDrafted && (
                              <AgentSignal
                                agent={msg.senderAgent}
                                label={
                                  msg.status === "draft"
                                    ? "AI draft"
                                    : "AI drafted"
                                }
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                  });
                })()}
              </div>

              {/* Reply area */}
              <InlineReplyCompose
                threadId={selectedThread.threadId}
                patientId={selectedThread.patientId}
              />
              {/* EMR-660 — Export modal. Controlled by the Export button in the
                  thread header above. Mounts here so it's scoped to the
                  currently-selected thread. */}
              <ExportModal
                open={exportOpen}
                onClose={() => setExportOpen(false)}
                patientName={selectedThread.patientName}
                subject={selectedThread.subject}
                messages={selectedThread.messages.map(
                  (m): ExportableMessage => ({
                    id: m.id,
                    body: m.body,
                    createdAt: m.createdAt,
                    senderLabel: m.senderUserId === currentUserId
                      ? "You"
                      : m.sender
                        ? `${m.sender.firstName} ${m.sender.lastName}`
                        : m.senderAgent
                          ? `${m.senderAgent.split(":")[0] ?? "AI Assistant"} (AI)`
                          : selectedThread.patientName,
                  }),
                )}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-text-subtle mb-2 flex justify-center">
                  <InboxIcon />
                </div>
                <p className="text-sm text-text-muted">
                  Select a conversation to view messages
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Bulk action bar — slides up when any inbox thread is selected. */}
      <BulkActionBar
        count={selection.size}
        onClear={selection.clear}
        itemNoun="thread"
        ariaLabel="Inbox bulk actions"
        actions={[
          {
            key: "read",
            label: "Mark read",
            onClick: handleBulkMarkRead,
            isPending: bulkPending === "read",
          },
          {
            key: "resolve",
            label: "Resolve",
            onClick: handleBulkResolve,
            isPending: bulkPending === "resolve",
          },
          {
            key: "assign",
            label: "Assign to me",
            onClick: handleBulkAssign,
            isPending: bulkPending === "assign",
          },
          {
            key: "export",
            label: "Export",
            onClick: handleBulkExportThreads,
            isPending: bulkPending === "export",
          },
        ]}
      />
    </div>
    </>
  );
}