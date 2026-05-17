"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SparklesIcon } from "lucide-react";

export function ChatCB() {
  const [messages, setMessages] = useState<{ role: "user" | "ai", content: string, sources?: string[] }[]>([
    {
      role: "ai",
      content: "Hello! I am ChatCB. I can synthesize multi-source clinical evidence across PubMed, ClinicalTrials.gov, and Verdant's internal pharmacopeia. What would you like to research today?",
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input;
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/agents/chat-cb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [...prev, { role: "ai", content: "Error: " + data.error }]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            content: data.content,
            sources: data.sources,
          }
        ]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "ai", content: "Failed to connect to ChatCB service." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="flex flex-col h-[500px]">
      <CardHeader className="border-b border-border py-3 px-4 bg-surface-muted/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-accent" />
            ChatCB Synthesizer
          </CardTitle>
          <Badge tone="accent" className="text-[10px]">Multi-source</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              {m.role === "ai" ? (
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                  <SparklesIcon className="w-4 h-4 text-accent" />
                </div>
              ) : (
                <Avatar firstName="Me" lastName="" size="sm" className="shrink-0" />
              )}
              <div className={`max-w-[80%] rounded-xl px-4 py-2 ${m.role === "user" ? "bg-blue-600 text-white" : "bg-surface-raised border border-border text-text"}`}>
                <p className={`text-sm leading-relaxed ${m.role === "user" ? "text-white" : "text-text"}`}>
                  {m.content}
                </p>
                {m.sources && (
                  <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-1.5">
                    {m.sources.map(s => (
                      <Badge key={s} tone="neutral" className="text-[9px] bg-surface">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                <SparklesIcon className="w-4 h-4 text-accent animate-pulse" />
              </div>
              <div className="bg-surface-raised border border-border rounded-xl px-4 py-2">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                </span>
              </div>
            </div>
          )}
        </div>
        <form onSubmit={handleSend} className="p-3 border-t border-border bg-surface flex gap-2">
          <Input 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            placeholder="Ask ChatCB to synthesize evidence..." 
            className="flex-1 text-sm"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="sm">
            Ask
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
