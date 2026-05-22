"use client";

import React, { useState, useRef, useEffect } from "react";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: Date;
}

export function InsightChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init",
      sender: "assistant",
      text: "I noticed a 14% anomaly in dosing efficacy for Cohort A today. Specifically, patients on SSRIs are reporting diminished effects. Would you like me to extrapolate the root cause?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const suggestionChips = [
    "Analyze SSRI interaction",
    "Show claims anomalies",
    "Show cohort outcomes",
  ];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/leafnerd/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: textToSend }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch response");
      }

      const data = await response.json();
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        text: data.reply || "No insights found.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: `err-${Date.now()}`,
        sender: "assistant",
        text: "Error connecting to clinical intelligence route. Please verify server connection.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-bg-surface border border-border/10 rounded-2xl p-6 h-[400px] flex flex-col relative overflow-hidden group hover:border-accent-strong/30 transition-colors shadow-sm">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-accent-strong/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/5 relative z-10">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-accent-strong flex items-center justify-center shadow-lg shadow-accent-strong/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-bg">
              <path d="M12 2v20" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-strong">Insight Assistant</h3>
            <p className="text-[10px] text-accent-strong font-bold uppercase tracking-wider">Active Engine</p>
          </div>
        </div>
      </div>

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent relative z-10">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col max-w-[85%] ${
              msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"
            }`}
          >
            <div
              className={`p-3.5 rounded-2xl text-sm leading-relaxed ${
                msg.sender === "user"
                  ? "bg-accent-strong text-bg rounded-tr-sm shadow-md font-medium"
                  : "bg-bg border border-border/10 text-text-strong rounded-tl-sm shadow-sm"
              }`}
            >
              {msg.text}
            </div>
            <span className="text-[9px] text-text-muted mt-1 px-1">
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        {isLoading && (
          <div className="flex flex-col items-start max-w-[80%] mr-auto">
            <div className="bg-bg border border-border/10 p-3.5 rounded-2xl rounded-tl-sm text-sm text-text-strong shadow-sm flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-accent-strong animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 rounded-full bg-accent-strong animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 rounded-full bg-accent-strong animate-bounce" />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Suggestion Chips */}
      {messages.length === 1 && !isLoading && (
        <div className="flex flex-wrap gap-2 mb-3 relative z-10">
          {suggestionChips.map((chip) => (
            <button
              key={chip}
              onClick={() => handleSendMessage(chip)}
              className="text-xs px-3 py-1.5 rounded-full bg-bg border border-border/10 text-text hover:border-accent-strong hover:bg-accent-strong/5 hover:text-accent-strong transition-all font-medium"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage(input);
        }}
        className="flex items-center gap-2 pt-3 border-t border-border/5 relative z-10"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask clinical queries..."
          className="flex-1 bg-bg border border-border/10 rounded-xl px-4 py-2.5 text-sm text-text-strong placeholder-text-muted focus:outline-none focus:border-accent-strong focus:ring-1 focus:ring-accent-strong/20 transition-all"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="p-2.5 bg-accent-strong text-bg rounded-xl font-bold text-sm shadow-md hover:shadow-lg hover:bg-accent-strong/90 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:shadow-none transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
