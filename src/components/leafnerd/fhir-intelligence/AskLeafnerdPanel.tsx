"use client";
/* LEAFNERD — "Ask Leafnerd" conversational chat panel.
   Right-side slide-in built from the theme's .scrim + .drawer classes.
   Calls POST /api/leafnerd/chat with { message } and renders { reply }. */
import React from "react";
import { Icon } from "./primitives";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "Which cohort has the most open HbA1c gaps?",
  "Summarize the Riverside Lab anomaly",
  "Who needs a medication review?",
];

const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  text:
    "Hi — I'm Leafnerd. Ask me about cohorts, care gaps, anomalies, or billing, " +
    "and I'll answer from your live FHIR data. Try one of the prompts below to get started.",
};

export function AskLeafnerdPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const seq = React.useRef(0);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Escape-to-close (same pattern as Drawer.tsx)
  React.useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);

  // Auto-scroll the thread + focus the composer when opened / on new messages
  React.useEffect(() => {
    if (!open) return;
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [open, messages, loading]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = React.useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || loading) return;

    seq.current += 1;
    const userMsg: ChatMessage = { id: `u-${seq.current}`, role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/leafnerd/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      seq.current += 1;
      const reply: ChatMessage = {
        id: `a-${seq.current}`,
        role: "assistant",
        text: data.reply || "No insights found for that query.",
      };
      setMessages((prev) => [...prev, reply]);
    } catch {
      seq.current += 1;
      const fallback: ChatMessage = {
        id: `a-${seq.current}`,
        role: "assistant",
        text:
          "I couldn't reach the intelligence service just now. Please check your connection " +
          "and try that question again in a moment.",
      };
      setMessages((prev) => [...prev, fallback]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  if (!open) return null;

  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose}></div>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Ask Leafnerd">
        <div className="drawer-head">
          <span
            style={{
              width: 34, height: 34, borderRadius: 9, flex: "none", display: "grid",
              placeItems: "center", background: "var(--canopy-faint)", color: "var(--canopy)",
              border: "1px solid var(--line-sage)",
            }}
          >
            <Icon name="spark" size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="dh-tag">Conversational</div>
            <h3>Ask Leafnerd</h3>
            <div className="m-prov" style={{ marginTop: 5 }}>
              <Icon name="spark" size={11} /> AI · grounded in your FHIR data
            </div>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close panel">
            <Icon name="x" size={17} />
          </button>
        </div>

        <div className="drawer-body" ref={bodyRef}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isUser ? "flex-end" : "flex-start",
                    maxWidth: "86%",
                    padding: "10px 13px",
                    borderRadius: 13,
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    border: "1px solid",
                    borderColor: isUser ? "var(--canopy)" : "var(--line-sage)",
                    background: isUser ? "var(--canopy)" : "var(--sage-tint)",
                    color: isUser ? "#fff" : "var(--ink)",
                    boxShadow: "var(--sh-1)",
                  }}
                >
                  {m.text}
                </div>
              );
            })}

            {loading && (
              <div
                aria-live="polite"
                style={{
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "11px 14px",
                  borderRadius: 13,
                  border: "1px solid var(--line-sage)",
                  background: "var(--sage-tint)",
                  boxShadow: "var(--sh-1)",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 6, height: 6, borderRadius: "50%", background: "var(--canopy)",
                      animation: "ln-pulse 1.1s ease-in-out infinite",
                      animationDelay: `${i * 0.18}s`,
                    }}
                  />
                ))}
                <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 2 }}>Leafnerd is thinking…</span>
              </div>
            )}

            {messages.length === 1 && !loading && (
              <div className="wrap-gap" style={{ marginTop: 4 }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>
                    <Icon name="spark" size={13} />{s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          style={{
            display: "flex", alignItems: "center", gap: 9, padding: "12px 14px",
            borderTop: "1px solid var(--line)", background: "var(--paper-2)",
          }}
        >
          <label className="search" style={{ flex: 1, width: "auto" }}>
            <Icon name="search" size={15} />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about cohorts, gaps, anomalies…"
              disabled={loading}
              aria-label="Message Leafnerd"
            />
          </label>
          <button
            type="submit"
            className="insight-action"
            disabled={loading || !input.trim()}
            aria-label="Send message"
            style={{ flex: "none", opacity: loading || !input.trim() ? 0.5 : 1, cursor: loading || !input.trim() ? "default" : "pointer" }}
          >
            <Icon name="arrowR" size={15} />Send
          </button>
        </form>
      </aside>
    </React.Fragment>
  );
}
