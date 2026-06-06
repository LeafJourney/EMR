"use client";

import { useState, useRef, useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  DictationInput,
  DictationTextarea,
} from "@/components/ui/dictation-input";
import { cn } from "@/lib/utils/cn";
import { composePatientMessage, type ComposeResult } from "./actions";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function PencilSquareIcon() {
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
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
    </svg>
  );
}

function RestoreIcon() {
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
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

/** Expand arrows — shown when dock is in compact mode */
function ExpandIcon() {
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
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

/** Shrink arrows — shown when compose is maximized */
function ShrinkIcon() {
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
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="10" y1="14" x2="3" y2="21" />
      <line x1="21" y1="3" x2="14" y2="10" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Submit button — reads form pending state
// ---------------------------------------------------------------------------

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Sending…" : "Send Message"}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Draft persistence helpers
// ---------------------------------------------------------------------------

function draftKey(patientId: string) {
  return `msg-draft-compose:${patientId}`;
}

function loadDraft(patientId: string): { subject: string; body: string } | null {
  try {
    const raw = localStorage.getItem(draftKey(patientId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "subject" in parsed &&
      "body" in parsed
    ) {
      return {
        subject: String((parsed as Record<string, unknown>).subject ?? ""),
        body: String((parsed as Record<string, unknown>).body ?? ""),
      };
    }
  } catch {}
  return null;
}

function saveDraft(patientId: string, subject: string, body: string) {
  try {
    if (subject || body) {
      localStorage.setItem(draftKey(patientId), JSON.stringify({ subject, body }));
    } else {
      localStorage.removeItem(draftKey(patientId));
    }
  } catch {}
}

function clearDraft(patientId: string) {
  try {
    localStorage.removeItem(draftKey(patientId));
  } catch {}
}

// ---------------------------------------------------------------------------
// Dock component
// ---------------------------------------------------------------------------

type DockMode = "closed" | "minimized" | "open" | "maximized";

interface Props {
  patientId: string;
  patientName: string;
}

/**
 * EMR-658 — Gmail-style docked compose panel for use on the patient chart.
 *
 * Four states: closed → open (compact dock, 380×360) → minimized (title bar
 * only) → maximized (centered 560×520 overlay). Auto-saves draft to
 * localStorage so partial messages survive minimize / navigate away.
 * Escape key steps back through states: maximized → open → minimized → closed.
 */
export function MessagePatientDock({ patientId, patientName }: Props) {
  const [mode, setMode] = useState<DockMode>("closed");
  const [state, formAction] = useFormState<ComposeResult | null, FormData>(
    composePatientMessage,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const prevModeRef = useRef<DockMode>("closed");

  // Controlled mirrors so DictationInput / DictationTextarea can append
  // dictated transcripts.
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // Load draft when opening from closed state.
  useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = mode;

    if (prev === "closed" && (mode === "open" || mode === "maximized")) {
      const draft = loadDraft(patientId);
      if (draft) {
        setSubject(draft.subject);
        setBody(draft.body);
      }
    }
  }, [mode, patientId]);

  // Auto-save draft whenever subject/body change.
  useEffect(() => {
    if (mode === "closed") return;
    saveDraft(patientId, subject, body);
  }, [subject, body, patientId, mode]);

  // Close and reset on successful send.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setSubject("");
      setBody("");
      clearDraft(patientId);
      setMode("closed");
    }
  }, [state, patientId]);

  // Escape: maximized → open → minimized → closed.
  useEffect(() => {
    if (mode === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMode((m: DockMode) => {
        if (m === "maximized") return "open";
        if (m === "open") return "minimized";
        return "closed";
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const open = () => setMode("open");
  const close = () => setMode("closed");
  const toggleMinimize = () =>
    setMode((m: DockMode) => (m === "minimized" ? "open" : "minimized"));
  const toggleMaximize = () =>
    setMode((m: DockMode) => (m === "maximized" ? "open" : "maximized"));

  const isExpanded = mode === "open" || mode === "maximized";

  const composeForm = (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col"
      style={{ height: mode === "maximized" ? "calc(520px - 44px)" : "calc(360px - 44px)" }}
    >
      <input type="hidden" name="patientId" value={patientId} />

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-text-subtle uppercase tracking-wide mb-1">
            Subject
          </label>
          <DictationInput
            name="subject"
            placeholder="Subject…"
            required
            className="text-sm"
            value={subject}
            onChange={setSubject}
            aria-label="Message subject"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-text-subtle uppercase tracking-wide mb-1">
            Message
          </label>
          <DictationTextarea
            name="body"
            rows={mode === "maximized" ? 12 : 5}
            placeholder="Write your message to the patient — or tap the mic to dictate…"
            required
            className="resize-none text-sm"
            value={body}
            onChange={setBody}
            aria-label="Message body"
          />
        </div>
        {state?.ok === false && (
          <p className="text-xs text-danger">{state.error}</p>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border bg-surface flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={close}
          className="text-xs text-text-muted hover:text-text transition-colors"
        >
          Discard
        </button>
        <SendButton />
      </div>
    </form>
  );

  return (
    <>
      {/* Inline trigger — sits in the quick-actions flex row */}
      <Button
        variant="ghost"
        size="sm"
        onClick={open}
        className="inline-flex items-center gap-1.5"
      >
        <PencilSquareIcon />
        Message Patient
      </Button>

      {/* Scrim — only shown in maximized mode; clicking outside shrinks back */}
      {mode === "maximized" && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          onClick={toggleMaximize}
          aria-hidden="true"
        />
      )}

      {/* Docked / maximized panel */}
      {mode !== "closed" && (
        <div
          className={cn(
            "fixed z-50 rounded-t-xl shadow-2xl",
            "border border-border bg-surface overflow-hidden",
            "transition-all duration-200 ease-out",
            mode === "maximized"
              ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[520px] rounded-xl"
              : mode === "minimized"
              ? "bottom-0 right-6 w-[380px] h-[44px]"
              : "bottom-0 right-6 w-[380px] h-[360px]",
          )}
          role="dialog"
          aria-label={`Message ${patientName}`}
          aria-modal={mode === "maximized" ? "true" : "false"}
        >
          {/* Title bar */}
          <div className="flex items-center h-[44px] bg-surface-muted border-b border-border shrink-0">
            {/* Left area: click to toggle minimize */}
            <button
              type="button"
              onClick={toggleMinimize}
              className="flex-1 min-w-0 px-4 text-left cursor-pointer select-none"
              aria-label={mode === "minimized" ? "Restore compose" : "Minimize compose"}
            >
              <span className="text-xs font-semibold text-text truncate block leading-tight">
                Message: {patientName}
              </span>
              {(subject || body) && mode !== "minimized" && (
                <span className="text-[10px] text-text-muted truncate block leading-none mt-0.5">
                  {subject || "Draft"}
                </span>
              )}
            </button>

            {/* Right: expand / minimize / close controls */}
            <div className="flex items-center gap-0.5 pr-2 shrink-0">
              {/* Expand ↔ Shrink toggle — hidden while minimized */}
              {mode !== "minimized" && (
                <button
                  type="button"
                  onClick={toggleMaximize}
                  className="p-1.5 rounded hover:bg-surface-raised transition-colors text-text-muted hover:text-text"
                  aria-label={mode === "maximized" ? "Shrink compose" : "Expand compose"}
                >
                  {mode === "maximized" ? <ShrinkIcon /> : <ExpandIcon />}
                </button>
              )}
              <button
                type="button"
                onClick={toggleMinimize}
                className="p-1.5 rounded hover:bg-surface-raised transition-colors text-text-muted hover:text-text"
                aria-label={mode === "minimized" ? "Restore" : "Minimize"}
              >
                {mode === "minimized" ? <RestoreIcon /> : <MinimizeIcon />}
              </button>
              <button
                type="button"
                onClick={close}
                className="p-1.5 rounded hover:bg-surface-raised transition-colors text-text-muted hover:text-text"
                aria-label="Close compose"
              >
                <XIcon />
              </button>
            </div>
          </div>

          {/* Compose body — only rendered when expanded */}
          {isExpanded && composeForm}
        </div>
      )}
    </>
  );
}
