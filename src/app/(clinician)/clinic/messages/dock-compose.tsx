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
// Dock component
// ---------------------------------------------------------------------------

type DockMode = "closed" | "minimized" | "open";

interface Props {
  patientId: string;
  patientName: string;
}

/**
 * EMR-658 — Gmail-style docked compose panel for use on the patient chart.
 *
 * Renders an inline "Message Patient" ghost button (placed in the
 * quick-actions row) plus a fixed bottom-right compose panel that supports
 * minimize / restore / close. On successful send the dock closes and the
 * new thread appears in /clinic/messages.
 */
export function MessagePatientDock({ patientId, patientName }: Props) {
  const [mode, setMode] = useState<DockMode>("closed");
  const [state, formAction] = useFormState<ComposeResult | null, FormData>(
    composePatientMessage,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  // Controlled mirrors so DictationInput / DictationTextarea can append
  // dictated transcripts. Cleared on send + on dock close.
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // Close and reset the form after a successful send
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setSubject("");
      setBody("");
      setMode("closed");
    }
  }, [state]);

  const open = () => setMode("open");
  const close = () => setMode("closed");
  const toggleMinimize = () =>
    setMode(mode === "minimized" ? "open" : "minimized");

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

      {/* Docked panel — fixed bottom-right, overlays the page */}
      {mode !== "closed" && (
        <div
          className={cn(
            "fixed bottom-0 right-6 z-50 w-[380px] rounded-t-xl shadow-2xl",
            "border border-border bg-surface overflow-hidden",
            "transition-[height] duration-200 ease-out",
            mode === "minimized" ? "h-[44px]" : "h-[340px]",
          )}
          role="dialog"
          aria-label={`Message ${patientName}`}
          aria-modal="false"
        >
          {/* Title bar */}
          <div className="flex items-center h-[44px] bg-surface-muted border-b border-border">
            {/* Left area: click to toggle minimize */}
            <button
              type="button"
              onClick={toggleMinimize}
              className="flex-1 min-w-0 px-4 text-left cursor-pointer select-none"
              aria-label={mode === "minimized" ? "Restore compose" : "Minimize compose"}
            >
              <span className="text-xs font-semibold text-text truncate block">
                Message: {patientName}
              </span>
            </button>

            {/* Right: minimize / close controls */}
            <div className="flex items-center gap-0.5 pr-2 shrink-0">
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
          {mode === "open" && (
            <form
              ref={formRef}
              action={formAction}
              className="flex flex-col"
              style={{ height: "calc(340px - 44px)" }}
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
                    rows={5}
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

              <div className="px-4 py-3 border-t border-border bg-surface flex items-center justify-between">
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
          )}
        </div>
      )}
    </>
  );
}
