"use client";
/* LEAFNERD — "Ask Leafnerd" conversational chat panel.
   Premium botanical glass slide-in built on the theme's .scrim + .drawer.ln-ask
   classes. Streams POST /api/leafnerd/chat (SSE) and renders the assistant
   reply as live, full Markdown grounded in real DB counts. */
import React from "react";
import { Icon } from "./primitives";
import { Markdown } from "./markdown";

interface Grounding {
  activePatients: number;
  totalPatients: number;
  activeEncounters: number;
  encountersThisWeek: number;
  recentOutcomesCount: number;
  topMetric: { metric: string; count: number; avg: number | null } | null;
  generatedAt: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
  grounding?: Grounding | null;
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
    "Hi — I'm **Leafnerd**. Ask me about cohorts, care gaps, anomalies, or billing, " +
    "and I'll answer from your live FHIR data. Try one of the prompts below to get started.",
};

const fmt = (n: number) => n.toLocaleString("en-US");

/** Subtle "grounded in live data" footer rendered under assistant replies. */
function GroundingFooter({ g }: { g: Grounding }) {
  const bits = [
    `${fmt(g.activePatients)} active patients`,
    `${fmt(g.activeEncounters)} encounters in flight`,
    `${fmt(g.recentOutcomesCount)} outcome logs (7d)`,
  ];
  return (
    <div className="ln-grounding" aria-label="Grounded in live data">
      <Icon name="shield" size={11} />
      <span>Grounded in live data · {bits.join(" · ")}</span>
    </div>
  );
}

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
    seq.current += 1;
    const replyId = `a-${seq.current}`;
    const placeholder: ChatMessage = { id: replyId, role: "assistant", text: "", streaming: true };
    setMessages((prev) => [...prev, userMsg, placeholder]);
    setInput("");
    setLoading(true);

    const patch = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === replyId ? fn(m) : m)));

    try {
      const res = await fetch("/api/leafnerd/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ message: text, stream: true }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const ct = res.headers.get("content-type") ?? "";

      // Graceful fallback if a non-streaming JSON body comes back.
      if (!res.body || !ct.includes("text/event-stream")) {
        const data = await res.json();
        patch((m) => ({
          ...m,
          text: data.reply || "No insights found for that query.",
          grounding: data.grounding ?? null,
          streaming: false,
        }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let errored: string | null = null;

      const handleEvent = (payload: string) => {
        if (!payload || payload === "[DONE]") return;
        let evt: any;
        try { evt = JSON.parse(payload); } catch { return; }
        if (evt.type === "delta" && typeof evt.text === "string") {
          acc += evt.text;
          patch((m) => ({ ...m, text: acc }));
        } else if (evt.type === "grounding" && evt.data) {
          patch((m) => ({ ...m, grounding: evt.data }));
        } else if (evt.type === "error" && typeof evt.message === "string") {
          errored = evt.message;
        }
      };

      // Read the SSE stream, splitting on blank-line-delimited events.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).replace(/\r$/, "");
          buffer = buffer.slice(nl + 1);
          if (line.startsWith("data:")) handleEvent(line.slice(5).trim());
        }
      }

      if (errored && !acc) {
        patch((m) => ({ ...m, text: errored as string, streaming: false }));
      } else {
        patch((m) => ({ ...m, text: acc || "No insights found for that query.", streaming: false }));
      }
    } catch {
      patch((m) => ({
        ...m,
        text:
          "I couldn't reach the intelligence service just now. Please check your connection " +
          "and try that question again in a moment.",
        streaming: false,
      }));
    } finally {
      setLoading(false);
    }
  }, [loading]);

  if (!open) return null;

  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose}></div>
      <aside className="drawer ln-ask" role="dialog" aria-modal="true" aria-label="Ask Leafnerd">
        <div className="drawer-head">
          <span className="ln-ask-avatar">
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

        <div className="drawer-body ln-ask-body" ref={bodyRef}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m) => {
              const isUser = m.role === "user";
              const showThinking = m.streaming && m.text === "";
              return (
                <div key={m.id} className={`ln-msg ${isUser ? "user" : "bot"}`}>
                  {isUser ? (
                    <span className="ln-msg-text">{m.text}</span>
                  ) : showThinking ? (
                    <span className="ln-thinking" aria-live="polite">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="ln-dot" style={{ animationDelay: `${i * 0.18}s` }} />
                      ))}
                      <span className="ln-thinking-label">Leafnerd is thinking…</span>
                    </span>
                  ) : (
                    <React.Fragment>
                      <Markdown source={m.text} />
                      {m.streaming && <span className="ln-caret" aria-hidden="true" />}
                      {!m.streaming && m.grounding && <GroundingFooter g={m.grounding} />}
                    </React.Fragment>
                  )}
                </div>
              );
            })}

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
          className="ln-ask-composer"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
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
