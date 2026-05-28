"use client";

import { useState, useRef } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  EVIDENCE_COLORS,
  STUDY_TYPE_LABELS,
  type Citation,
} from "@/lib/domain/chatcb";

interface Message {
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  loading?: boolean;
}

export function ChatCBPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function send() {
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);

    const userMsg: Message = { role: "user", text: question };
    const assistantMsg: Message = {
      role: "assistant",
      text: "",
      loading: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/agents/chat-cb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accText = "";
      let citations: Citation[] | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).replace(/\r$/, "");
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;

          try {
            const event = JSON.parse(payload) as {
              type: string;
              text?: string;
              items?: Citation[];
              message?: string;
            };

            if (event.type === "delta" && event.text) {
              accText += event.text;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "assistant",
                  text: accText,
                  loading: true,
                };
                return next;
              });
            } else if (event.type === "citations" && event.items) {
              citations = event.items;
            } else if (event.type === "done") {
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "assistant",
                  text: accText || "(No response)",
                  loading: false,
                  citations,
                };
                return next;
              });
            } else if (event.type === "error") {
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "assistant",
                  text: event.message ?? "An error occurred.",
                  loading: false,
                };
                return next;
              });
            }
          } catch {
            /* skip malformed SSE lines */
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            text: "Could not reach ChatCB. Please try again.",
            loading: false,
          };
          return next;
        });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="text-base">🌿</span>
          ChatCB
        </CardTitle>
        <CardDescription className="text-xs">
          Ask about cannabinoids, conditions, or evidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {messages.length > 0 && (
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="bg-accent text-accent-ink rounded-2xl rounded-tr-sm px-3 py-2 text-xs max-w-[85%] leading-relaxed">
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-surface-muted rounded-2xl rounded-tl-sm px-3 py-2 text-xs text-text leading-relaxed max-w-[95%]">
                      {msg.loading && msg.text === "" ? (
                        <span className="text-text-subtle italic">
                          Thinking…
                        </span>
                      ) : (
                        msg.text
                      )}
                      {msg.loading && msg.text !== "" && (
                        <span className="inline-block w-1 h-3 bg-accent ml-0.5 animate-pulse rounded-sm" />
                      )}
                    </div>
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="space-y-2 ml-1">
                        <p className="text-[10px] text-text-subtle uppercase tracking-wide font-medium">
                          Evidence
                        </p>
                        {msg.citations.map((c, ci) => {
                          const ev = EVIDENCE_COLORS[c.evidenceLevel];
                          const isPubmed = c.id.startsWith("pubmed-");
                          return (
                            <div
                              key={ci}
                              className={`rounded-lg px-2.5 py-2 border border-border/10 transition-all ${ev.bg}`}
                            >
                              {isPubmed ? (
                                <div className="space-y-1">
                                  <div className="flex items-start justify-between gap-1.5">
                                    <p className="text-xs font-semibold text-text leading-tight">
                                      {c.title}
                                    </p>
                                    {c.pmid && (
                                      <a
                                        href={`https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[9px] font-mono text-accent hover:underline shrink-0 flex items-center gap-0.5"
                                      >
                                        PMID {c.pmid} ↗
                                      </a>
                                    )}
                                  </div>
                                  <p className="text-[9px] text-text-subtle">
                                    {c.authors} · <span className="italic">{c.journal}</span> ({c.year})
                                  </p>
                                  <div className="flex items-center gap-1.5 pt-1">
                                    <Badge
                                      tone="neutral"
                                      className="text-[8px] py-0 px-1.5 h-3.5"
                                    >
                                      {STUDY_TYPE_LABELS[c.studyType]}
                                    </Badge>
                                    <Badge
                                      className={`text-[8px] py-0 px-1.5 h-3.5 border-0 ${ev.bg} ${ev.text}`}
                                    >
                                      {ev.emoji} {ev.label}
                                    </Badge>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`text-[10px] font-bold ${ev.text}`}
                                    >
                                      {ev.emoji}
                                    </span>
                                    <span className="text-xs font-medium text-text">
                                      {c.title}
                                    </span>
                                    <Badge
                                      tone="neutral"
                                      className="ml-auto text-[9px] py-0 h-4"
                                    >
                                      Internal DB
                                    </Badge>
                                  </div>
                                </div>
                              )}
                              <p className="text-[10px] text-text-muted mt-1 leading-relaxed">
                                {c.summary}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {messages.length === 0 && (
          <div className="py-2 space-y-1.5">
            {[
              "CBD for anxiety — evidence?",
              "THC vs chronic pain",
              "CBN sleep studies",
            ].map((hint) => (
              <button
                key={hint}
                type="button"
                onClick={() => {
                  setInput(hint);
                }}
                className="block w-full text-left text-xs text-text-muted hover:text-text bg-surface-muted/50 hover:bg-surface-muted rounded-lg px-2.5 py-1.5 transition-colors"
              >
                {hint}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask ChatCB…"
            className="flex-1 text-xs h-8"
            disabled={busy}
          />
          <Button
            size="sm"
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            className="h-8 px-3 text-xs shrink-0"
          >
            {busy ? "…" : "Ask"}
          </Button>
        </div>

        <p className="text-[10px] text-text-subtle text-center leading-relaxed">
          Not a substitute for clinical judgement. Always verify citations.
        </p>
      </CardContent>
    </Card>
  );
}
