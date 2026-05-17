"use client";

// ---------------------------------------------------------------------------
// EMR-309 — Ask Cindy floating widget
// ---------------------------------------------------------------------------
// Drop this component anywhere in the public site (landing page footer
// area or layout root) and a quiet leaf-shaped button appears bottom-right.
// Clicking it expands an iOS-style chat panel.
// ---------------------------------------------------------------------------

import { useState, useRef, useEffect } from "react";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { askCindyAction } from "./actions";
import { CINDY_HIGHLIGHTS } from "@/lib/agents/cindy";
import type { AskCindyResult } from "@/lib/agents/cindy";

function parseMessageLinks(text: string) {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  
  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(
      <a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-accent underline hover:text-accent-hover transition-colors font-medium">
        {match[1]}
      </a>
    );
    lastIndex = linkRegex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}

interface CindyMessage {
  id: string;
  role: "user" | "cindy";
  content: string;
  handoff?: AskCindyResult["handoff"];
}

type CindyMode = "public" | "patient";

interface StarterPrompt {
  id: string;
  label: string;
  question: string;
  highlightId?: string;
}

const PATIENT_PROMPTS: StarterPrompt[] = [
  {
    id: "next-best-step",
    label: "What should I do next?",
    question:
      "I am in the patient portal. Help me decide what to do next today, using only general portal guidance and no medical advice.",
  },
  {
    id: "explain-results",
    label: "Explain my portal",
    question:
      "Give me a simple tour of where to find records, messages, dosing, education, and check-ins in this patient portal.",
  },
  {
    id: "prepare-visit",
    label: "Prepare for my visit",
    question:
      "Help me prepare for an upcoming care visit. Keep it practical and suggest which portal areas to update.",
  },
];

function starterPromptsFor(mode: CindyMode): StarterPrompt[] {
  if (mode === "patient") return PATIENT_PROMPTS;
  return CINDY_HIGHLIGHTS.map((h) => ({
    id: h.id,
    label: h.label,
    question: h.label,
    highlightId: h.id,
  }));
}

export function AskCindyWidget({ mode = "public" }: { mode?: CindyMode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CindyMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const patientMode = mode === "patient";
  const starterPrompts = starterPromptsFor(mode);

  // EMR-157 — re-scroll on `pending` flips so the loading bubble is
  // brought into view as it appears, not only when the response
  // replaces it. The reserved-height slot below keeps the swap
  // layout-stable so the smooth scroll lands cleanly.
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open, pending]);

  async function send(text: string, highlightId?: string) {
    const q = text.trim();
    if (!q || pending) return;

    const userMsg: CindyMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: q,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPending(true);

    const result = await askCindyAction(q, highlightId);
    setMessages((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        role: "cindy",
        content: result.answer,
        handoff: result.handoff,
      },
    ]);
    setPending(false);
  }

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        aria-label={open ? "Close Cindy" : "Ask Cindy"}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 z-40 h-14 w-14 rounded-full",
          "flex items-center justify-center",
          "hover:scale-105 active:scale-95 transition-all",
          patientMode
            ? "left-6 liquid-glass text-accent shadow-xl"
            : "right-6 bg-accent text-white shadow-xl",
        )}
      >
        {open ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Ask Cindy"
          className={cn(
            "fixed bottom-24 z-40 w-[min(380px,calc(100vw-3rem))]",
            patientMode ? "left-6 liquid-glass" : "right-6 bg-white/95 backdrop-blur-xl border border-slate-200",
            "rounded-3xl shadow-2xl",
            "animate-in fade-in slide-in-from-bottom-4 duration-300",
            "flex flex-col max-h-[70vh]",
          )}
        >
          <header className="px-5 pt-5 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-text">Ask Cindy</p>
                <p className="text-xs text-text-muted">
                  {patientMode ? "Ambient guide for your care portal" : "Tour guide for Leafjourney"}
                </p>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-text-muted">
                  Quick questions to get you started:
                </p>
                <div className="flex flex-wrap gap-2">
                  {starterPrompts.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => send(h.question, h.highlightId)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-accent hover:text-accent transition-all"
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-accent text-white rounded-br-sm"
                      : "bg-slate-50 text-slate-800 rounded-bl-sm",
                  )}
                >
                  <div className="whitespace-pre-wrap">{parseMessageLinks(m.content)}</div>
                  {m.handoff && (
                    <a
                      href={m.handoff.href}
                      className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-accent hover:underline"
                    >
                      {m.handoff.label} <ArrowRight className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}

            {/* EMR-157 — fixed-height slot for the thinking bubble.
                Reserves the bubble's footprint whether or not the
                indicator is visible so layout is stable through the
                pending → response swap. */}
            <div
              className="min-h-[44px]"
              aria-live="polite"
              aria-busy={pending || undefined}
            >
              {pending && (
                <div className="flex justify-start">
                  <div className="bg-slate-50 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-slate-500">
                    <span className="animate-pulse">Thinking…</span>
                  </div>
                </div>
              )}
            </div>

            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-slate-100 p-3 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Cindy a quick question…"
              className="flex-1 h-10 px-3 rounded-full bg-slate-50 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={!input.trim() || pending}
              aria-label="Send"
              className="h-10 w-10 rounded-full bg-accent text-white flex items-center justify-center hover:bg-accent/90 disabled:opacity-40 transition-all"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <p className="text-[10px] text-center text-slate-400 pb-3 px-5">
            Cindy helps with portal guidance, not diagnosis or treatment. Not medical advice.
          </p>
        </div>
      )}
    </>
  );
}
