"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { useToast } from "@/components/ui/toast";
import { FileUpload, type FileUploadItem } from "@/components/ui/file-upload";

// EMR-128 — universal feedback FAB. Mounted once at the root layout so
// every route in every role sees the same pulse-of-the-product channel.
//
// EMR-365 — the optional drawing canvas was removed; almost no whispers
// arrived with annotations and the toolbar made the modal feel heavy.
// We still capture the page URL + viewport automatically so reports stay
// contextual without asking the user to draw anything.

type State = "closed" | "form" | "submitting" | "thanks" | "error";

export function UniversalFeedbackFab() {
  const [state, setState] = useState<State>("closed");
  const [comment, setComment] = useState("");
  const [area, setArea] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<FileUploadItem[]>([]);
  const { toast } = useToast();

  // Persist a stable client-id per browser to dedupe repeats / retries.
  const clientIdRef = useRef<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    let id = window.localStorage.getItem("lj-whisper-client-id");
    if (!id) {
      id = `wcid-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      window.localStorage.setItem("lj-whisper-client-id", id);
    }
    clientIdRef.current = id;
  }, []);

  function open() {
    setState("form");
    setError(null);
  }
  function close() {
    setState("closed");
    setComment("");
    setArea("");
    setError(null);
    setAttachments([]);
  }

  async function submit() {
    if (!area) {
      setError("Please select a topic so we can route this correctly.");
      return;
    }
    if (comment.trim().length < 5) {
      setError("Tell us a little more — at least 5 characters helps us route it.");
      return;
    }
    setState("submitting");
    setError(null);
    try {
      const attachmentNames = attachments
        .filter((a) => a.status === "uploaded")
        .map((a) => a.file.name);
      const payload = {
        clientId: clientIdRef.current,
        pageUrl: window.location.href,
        comment,
        area,
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        occurredAt: new Date().toISOString(),
        attachments: attachmentNames,
      };
      const res = await fetch("/api/feedback/whisper", {
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
      toast({
        title: "Thanks for the whisper",
        description: "On its way to Scott & Neal.",
        variant: "success",
      });
      setTimeout(close, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setState("error");
    }
  }

  if (state === "closed") {
    return (
      <button
        type="button"
        onClick={open}
        className={cn(
          // Apple HIG: 44pt minimum hit target. Bumped from h-12 w-12 to
          // h-14 w-14 on mobile so the FAB clears thumb-targeting on
          // small iPhones, while staying off the bottom MobileNav by
          // adding env(safe-area-inset-bottom) on iOS.
          "fixed z-[60] h-14 w-14 md:h-12 md:w-12 rounded-full",
          "bg-gradient-to-b from-emerald-700 to-emerald-800 text-white shadow-lg",
          "active:scale-95 hover:scale-105 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300",
        )}
        style={{
          bottom: "calc(env(safe-area-inset-bottom) + 1.25rem)",
          right: "calc(env(safe-area-inset-right) + 1.25rem)",
        }}
        aria-label="Send feedback"
        title="Send feedback"
      >
        <span className="block text-lg md:text-base">🌱</span>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch md:items-center justify-end md:justify-center bg-black/40 backdrop-blur-sm md:p-4"
      onClick={close}
    >
      <div
        className={cn(
          // Full-screen sheet on mobile (iOS modal pattern), centered
          // card on tablet+. Safe-area-aware padding so the sheet header
          // never hides under the Dynamic Island and the footer button
          // never sits beneath the home indicator.
          "w-full md:max-w-xl bg-surface-raised md:rounded-xl rounded-t-2xl md:rounded-b-xl",
          "border border-border shadow-xl flex flex-col",
          "max-h-screen md:max-h-[92vh] md:h-auto",
          "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:pt-0 md:pb-0",
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="px-5 pt-5 pb-3 flex items-start justify-between border-b border-border/60">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-subtle">Whisper</p>
            <h3 className="font-display text-lg text-text mt-0.5">What's on your mind?</h3>
            <p className="text-xs text-text-muted mt-1">
              Goes straight to Scott & Neal. No bots in between.
            </p>
          </div>
          <button
            onClick={close}
            className="inline-flex items-center justify-center w-11 h-11 -mr-2 rounded-full text-text-subtle hover:text-text hover:bg-surface-muted active:scale-95 transition-all text-xl leading-none"
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
              <select
                required
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                <option value="" disabled>Select a topic...</option>
                <option value="feature_request">Feature Request</option>
                <option value="performance">Bug Report / Performance</option>
                <option value="medications">Clinical / Medications</option>
                <option value="billing">Billing / Insurance</option>
                <option value="other">Other</option>
              </select>

              <MarkdownEditor
                value={comment}
                onChange={setComment}
                rows={4}
                placeholder="Loved it? Confused? Frustrated? Tell us in your own words."
                aria-label="Whisper message"
                minimalToolbar
                allowPreview={false}
                disableSlash
              />

              <div>
                <p className="text-[11px] uppercase tracking-wider text-text-subtle font-semibold mb-1.5">
                  Attachments (optional)
                </p>
                {/*
                  Server-side TODO: /api/feedback/whisper accepts JSON only.
                  Screenshots are queued locally; once the route accepts
                  multipart, swap the local handler for createFetchUploadHandler.
                */}
                <FileUpload
                  accept="image/*,.pdf"
                  maxFiles={3}
                  maxSizeMB={8}
                  concurrency={2}
                  label="Drop a screenshot or attach a doc"
                  hint="Helps us see what you saw — PNG, JPG, or PDF"
                  onUpload={async (file, { onProgress }) => {
                    for (let p = 0; p <= 100; p += 33) {
                      onProgress?.(Math.min(p, 100));
                      await new Promise((r) => setTimeout(r, 50));
                    }
                    return { id: `local-${file.name}`, name: file.name };
                  }}
                  onComplete={(items) => setAttachments(items)}
                />
              </div>

              <p className="text-[11px] text-text-subtle">
                We'll capture the page URL automatically. Any voice memos attached are auto-deleted after 30 days for privacy.
              </p>

              {error && <p className="text-sm text-danger">{error}</p>}
            </>
          )}
        </div>

        {state !== "thanks" && (
          <footer className="px-5 py-4 border-t border-border/60 flex items-center justify-between">
            <p className="text-[11px] text-text-subtle">First human response within 72h.</p>
            <button
              onClick={submit}
              disabled={state === "submitting"}
              className="inline-flex items-center justify-center gap-2 rounded-md font-medium px-4 h-11 md:h-9 text-sm bg-gradient-to-b from-emerald-700 to-emerald-800 text-white shadow-sm hover:from-emerald-700/90 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {state === "submitting" ? "Sending…" : "Send whisper"}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
