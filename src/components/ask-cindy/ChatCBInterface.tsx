"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, X, Send, Activity } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { sendChatCBMessage } from "@/app/(patient)/portal/chatcb-actions";

function TypingIndicator() {
  return (
    <div className="flex gap-1 items-center px-2 py-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 bg-accent/60 rounded-full"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export function ChatCBInterface() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ id: string; role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isTyping]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userContent = input.trim();
    const userMsg = { id: `u-${Date.now()}`, role: "user" as const, content: userContent };
    
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const response = await sendChatCBMessage({ threadId, content: userContent });
      if (response.threadId && !threadId) {
        setThreadId(response.threadId);
      }
      setMessages((prev) => [...prev, response.message]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: "I had trouble responding. Please try again." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            key="chatcb-float-btn"
            type="button"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-[120px] right-6 sm:bottom-[88px] z-[85] h-14 w-14 rounded-full bg-accent text-white shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
            aria-label="Open ChatCB"
          >
            <Bot size={24} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[84] md:hidden"
            />
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-[85] w-full md:w-[400px] bg-surface border-l border-border shadow-2xl flex flex-col"
            >
              <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface/80 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                    <Bot size={20} />
                  </div>
                  <div>
                    <h2 className="font-display font-semibold text-text">ChatCB</h2>
                    <p className="text-xs text-text-subtle flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                      AI Coach Online
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-full hover:bg-surface-hover text-text-subtle transition-colors"
                >
                  <X size={20} />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center py-10">
                    <div className="w-16 h-16 bg-accent/5 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Activity size={32} className="text-accent/40" />
                    </div>
                    <h3 className="font-display font-semibold text-text mb-2">Hello, I'm ChatCB</h3>
                    <p className="text-sm text-text-muted max-w-[250px] mx-auto mb-6">
                      I'm your personal AI health coach. I can help you understand your care plan, track symptoms, and stay consistent.
                    </p>
                    <div className="flex flex-col gap-2">
                      <button onClick={() => handleQuickPrompt("I'm feeling anxious right now")} className="text-sm bg-surface-raised border border-border py-2 px-4 rounded-full text-text-subtle hover:text-accent hover:border-accent transition-colors">"I'm feeling anxious right now"</button>
                      <button onClick={() => handleQuickPrompt("When should I take my dose?")} className="text-sm bg-surface-raised border border-border py-2 px-4 rounded-full text-text-subtle hover:text-accent hover:border-accent transition-colors">"When should I take my dose?"</button>
                    </div>
                  </div>
                )}
                {messages.map((msg) => {
                  const hasTrigger = msg.content.includes("[TRIGGER_SYMPTOM_LOG]");
                  const displayContent = msg.content.replace("[TRIGGER_SYMPTOM_LOG]", "").trim();

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex flex-col w-full gap-2",
                        msg.role === "user" ? "items-end" : "items-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed",
                          msg.role === "user"
                            ? "bg-accent text-white rounded-br-sm"
                            : "bg-surface-raised border border-border text-text rounded-bl-sm"
                        )}
                      >
                        {displayContent}
                      </div>
                      {hasTrigger && msg.role === "assistant" && (
                        <div className="pl-2">
                          <a href="/portal/outcomes/new" className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md transition-colors">
                            Log Symptoms Now
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
                {isTyping && (
                  <div className="flex justify-start w-full">
                    <div className="bg-surface-raised border border-border rounded-2xl rounded-bl-sm px-4 py-3">
                      <TypingIndicator />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="p-4 border-t border-border bg-surface">
                <form onSubmit={handleSend} className="relative">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Message ChatCB..."
                    className="w-full h-12 pl-4 pr-12 rounded-full bg-surface-raised border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 transition-shadow"
                    disabled={isTyping}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isTyping}
                    className="absolute right-1 top-1 bottom-1 w-10 flex items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    <Send size={16} className="ml-0.5" />
                  </button>
                </form>
                <p className="text-[10px] text-center text-text-subtle mt-3">
                  ChatCB is an AI assistant, not a doctor. Always consult your care team for medical advice.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
