"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { MarkdownEditor } from "@/components/ui/markdown-editor";

/**
 * Universal feedback widget — EMR-128. Floats bottom-right (`mode="fab"`)
 * or renders inline. Exposes `useFeedbackWidget()` for callers that want
 * to open it pre-seeded with a comment, tag, or metadata.
 */

type State = "closed" | "form" | "submitting" | "thanks" | "error";

export type FeedbackTag = "bug" | "idea" | "praise" | "confused";

const TAGS: Array<{ key: FeedbackTag; label: string; emoji: string }> = [
  { key: "bug", label: "Something broke", emoji: "🐞" },
  { key: "idea", label: "I have an idea", emoji: "💡" },
  { key: "confused", label: "I'm confused", emoji: "🤔" },
  { key: "praise", label: "I love this", emoji: "🌱" },
];

export interface FeedbackPayload {
  clientId: string;
  pageUrl: string;
  comment: string;
  tag: FeedbackTag | null;
  userAgent: string;
  viewport: { width: number; height: number };
  occurredAt: string;
  /** Caller-supplied metadata (route, patientId, encounterId, etc.). */
  extra?: Record<string, unknown>;
}

/**
 * Retained for back-compat with existing imports. The widget no longer
 * captures page screenshots — the annotation canvas was removed.
 */
export type Snapshotter = (target: HTMLElement) => Promise<string>;
export function setSnapshotter(_snap: Snapshotter | null) {
  /* no-op */
}

interface WidgetController {
  open: (seed?: { comment?: string; tag?: FeedbackTag; extra?: Record<string, unknown> }) => void;
}

const widgetRef: { current: WidgetController | null } = { current: null };

/**
 * Imperative handle for opening the widget from anywhere in the app.
 * Components subscribe inside an effect; the actual open() call is fire-
 * and-forget so it can be triggered from event handlers or notifications.
 */
export function useFeedbackWidget() {
  return React.useMemo<WidgetController>(
    () => ({
      open(seed) {
        widgetRef.current?.open(seed);
      },
    }),
    [],
  );
}

export interface FeedbackWidgetProps {
  /**
   * Where the launcher renders. `fab` = fixed bottom-right.
   * `inline` = caller controls placement (returns just the trigger
   * button; the dialog still portals to the document body).
   */
  mode?: "fab" | "inline";
  /** Endpoint the payload is POSTed to. */
  endpoint?: string;
  /** Optional className applied to the launcher button. */
  className?: string;
  /** Caller-attached metadata included in the submitted payload. */
  defaultExtra?: Record<string, unknown>;
}

export function FeedbackWidget({
  mode = "fab",
  endpoint = "/api/feedback/whisper",
  className,
  defaultExtra,
}: FeedbackWidgetProps) {
  const [state, setState] = React.useState<State>("closed");
  const [comment, setComment] = React.useState("");
  const [tag, setTag] = React.useState<FeedbackTag | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [extra, setExtra] = React.useState<Record<string, unknown> | undefined>(
    defaultExtra,
  );

  // Stable per-browser id used for de-dupe across reloads / retries.
  const clientIdRef = React.useRef<string>("");
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    let id = window.localStorage.getItem("lj-feedback-client-id");
    if (!id) {
      id = `fcid-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      window.localStorage.setItem("lj-feedback-client-id", id);
    }
    clientIdRef.current = id;
  }, []);

  const open = React.useCallback(
    async (seed?: { comment?: string; tag?: FeedbackTag; extra?: Record<string, unknown> }) => {
      setState("form");
      setError(null);
      if (seed?.comment) setComment(seed.comment);
      if (seed?.tag) setTag(seed.tag);
      if (seed?.extra) setExtra({ ...(defaultExtra ?? {}), ...seed.extra });
      else setExtra(defaultExtra);
    },
    [defaultExtra],
  );

  const close = React.useCallback(() => {
    setState("closed");
    setComment("");
    setTag(null);
    setError(null);
  }, []);

  // Register the imperative handle so useFeedbackWidget() callers can
  // open the widget from anywhere in the tree. Last mount wins; in
  // practice we only ever expect one widget per page.
  React.useEffect(() => {
    const handler: WidgetController["open"] = (seed) => {
      void open(seed);
    };
    widgetRef.current = { open: handler };
    return () => {
      if (widgetRef.current?.open === handler) {
        widgetRef.current = null;
      }
    };
  }, [open]);

  async function submit() {
    if (comment.trim().length < 5) {
      setError("Tell us a little more — at least 5 characters helps us route it.");
      return;
    }
    setState("submitting");
    setError(null);
    try {
      const payload: FeedbackPayload = {
        clientId: clientIdRef.current,
        pageUrl: window.location.href,
        comment,
        tag,
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        occurredAt: new Date().toISOString(),
        extra,
      };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `HTTP ${res.status}`);
        setState("error");
        return;
      }
      setState("thanks");
      setTimeout(close, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setState("error");
    }
  }

  const launcher =
    state === "closed" ? (
      <button
        type="button"
        onClick={() => void open()}
        className={cn(
          mode === "fab"
            ? "fixed bottom-5 right-5 z-[60] h-12 w-12 rounded-full"
            : "h-9 w-9 rounded-full",
          "bg-gradient-to-b from-emerald-700 to-emerald-800 text-white shadow-lg",
          "hover:scale-105 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300",
          className,
        )}
        aria-label="Send feedback"
        title="Send feedback"
      >
        <span className="block text-base">💬</span>
      </button>
    ) : null;

  if (state === "closed") return launcher;

  return (
    <>
      {launcher}
      <div
        className="fixed inset-0 z-[60] flex items-end md:items-center justify-end md:justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={close}
      >
        <div
          className="w-full max-w-xl bg-surface-raised rounded-xl border border-border shadow-xl flex flex-col max-h-[92vh]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Send feedback"
        >
          <header className="px-5 pt-5 pb-3 flex items-start justify-between border-b border-border/60">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-subtle">Whisper</p>
              <h3 className="font-display text-lg text-text mt-0.5">What's on your mind?</h3>
              <p className="text-xs text-text-muted mt-1">
                Goes straight to the team. No bots in between.
              </p>
            </div>
            <button
              onClick={close}
              className="text-text-subtle hover:text-text text-lg leading-none px-2"
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <div className="px-5 py-4 overflow-y-auto space-y-4">
            {state === "thanks" ? (
              <div className="py-12 text-center">
                <p className="font-display text-xl text-text">Thank you 🌱</p>
                <p className="text-sm text-text-muted mt-2">
                  Your whisper was received. We're listening.
                </p>
              </div>
            ) : (
              <>
                <fieldset className="space-y-2">
                  <legend className="text-[11px] uppercase tracking-wider text-text-subtle">
                    What kind of feedback?
                  </legend>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {TAGS.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTag((prev) => (prev === t.key ? null : t.key))}
                        aria-pressed={tag === t.key}
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors",
                          tag === t.key
                            ? "bg-emerald-700 text-white border-emerald-700"
                            : "bg-surface text-text-muted border-border hover:bg-surface-muted",
                        )}
                      >
                        <span aria-hidden>{t.emoji}</span>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <MarkdownEditor
                  value={comment}
                  onChange={setComment}
                  rows={4}
                  placeholder="Loved it? Confused? Frustrated? Tell us in your own words."
                  aria-label="Feedback message"
                  minimalToolbar
                  allowPreview={false}
                  disableSlash
                />

                <p className="text-[11px] text-text-subtle">
                  We&apos;ll capture the page URL automatically.
                </p>

                {error && <p className="text-sm text-danger">{error}</p>}
              </>
            )}
          </div>

          {state !== "thanks" && (
            <footer className="px-5 py-4 border-t border-border/60 flex items-center justify-between">
              <p className="text-[11px] text-text-subtle">First human response within 72h.</p>
              <button
                onClick={() => void submit()}
                disabled={state === "submitting"}
                className="inline-flex items-center justify-center gap-2 rounded-md font-medium px-4 h-9 text-sm bg-gradient-to-b from-emerald-700 to-emerald-800 text-white shadow-sm hover:from-emerald-700/90 disabled:opacity-50"
              >
                {state === "submitting" ? "Sending…" : "Send whisper"}
              </button>
            </footer>
          )}
        </div>
      </div>
    </>
  );
}

