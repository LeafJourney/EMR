"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Search, ArrowRight, Sparkles, Pill } from "lucide-react";
import { Eyebrow } from "@/components/ui/ornament";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { askChatCB } from "./actions";
import { EVIDENCE_COLORS, type ChatCBMessage } from "@/lib/domain/chatcb";

// Modular Components
import {
  EducationTabs,
  EDUCATION_TABS,
  panelId,
  tabId,
  type TabKey,
} from "@/components/education/EducationTabs";
import { ComboWheel } from "@/components/education/ComboWheel";
import { ResearchTab } from "@/components/education/ResearchTab";
import { CommunityTab } from "@/components/education/CommunityTab";
import { DiscussCombination } from "@/components/education/DiscussCombination";
import { DrugMixTab } from "@/components/education/DrugMixTab";

const SUGGESTED_QUESTIONS = [
  "Is CBD good for anxiety?",
  "THC vs CBD for pain",
  "Cannabis and sleep",
  "Drug interactions with warfarin",
  "What are terpenes?",
  "Cannabis for PTSD",
];

const VALID_TABS: TabKey[] = ["wheel", "chatcb", "drugmix", "research", "community"];

export default function EducationPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("wheel");
  const [wheelSelection, setWheelSelection] = useState<string[]>([]);

  // Honor #hash deep-links (e.g. /education#community) so other surfaces
  // can route to a specific tab on first load.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      const hash = window.location.hash.replace("#", "");
      if ((VALID_TABS as string[]).includes(hash)) {
        setActiveTab(hash as TabKey);
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader />

      <main id="main-content">

      {/* Hero */}
      <section className="max-w-[1320px] mx-auto px-6 lg:px-12 pt-16 pb-12 lg:pt-20 lg:pb-14 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <Eyebrow className="justify-center mb-6 text-accent">Evidence-based knowledge</Eyebrow>
        <h1 className="font-display text-5xl md:text-6xl lg:text-7xl tracking-tight text-text leading-[1.05] mb-6">
          Chat &amp; Learn
        </h1>
        <p className="text-lg md:text-xl text-text-muted max-w-2xl md:max-w-3xl mx-auto leading-relaxed">
          The ultimate social and educational platform. Search 11,000+ studies,
          explore cannabinoid science, and join the community — all free,
          no login required.
        </p>

        {/* EMR-617 — direct CTA for the Drug Mix standalone module so
            patients arriving on /education can jump straight to the
            interaction checker without first discovering the tab strip. */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/education/drug-mix"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-accent text-white text-sm font-semibold shadow-md hover:bg-accent/90 transition-all hover:-translate-y-0.5"
          >
            <Pill className="w-4 h-4" aria-hidden="true" />
            Open Drug Mix
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <EducationTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab content — each tab is a tabpanel keyed on activeTab so animate-in retriggers on change */}
      <div className="max-w-[1320px] mx-auto px-6 lg:px-12 py-16">
        {EDUCATION_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          if (!isActive) return null;
          return (
            <div
              key={tab.key}
              role="tabpanel"
              id={panelId(tab.key)}
              aria-labelledby={tabId(tab.key)}
              tabIndex={0}
              className="focus:outline-none animate-in fade-in slide-in-from-bottom-2 duration-500 ease-smooth"
            >
              {tab.key === "community" && <CommunityTab />}
              {tab.key === "chatcb" && <ChatCBTab />}
              {tab.key === "wheel" && (
                <>
                  <ComboWheel onSelect={setWheelSelection} />
                  <DiscussCombination
                    selectedIds={wheelSelection}
                    forumHref="/education#community"
                  />
                </>
              )}
              {tab.key === "drugmix" && <DrugMixTab />}
              {tab.key === "research" && <ResearchTab />}
            </div>
          );
        })}
      </div>

      </main>

      <SiteFooter />
    </div>
  );
}

function ChatCBTab() {
  const [messages, setMessages] = useState<ChatCBMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // EMR-157 — also re-scroll when the loading state flips so the
  // indicator slot is brought into view as it appears, rather than
  // only after the response replaces it.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function handleSubmit(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;

    const userMsg: ChatCBMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: q,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const result = await askChatCB(q);
      const assistantMsg: ChatCBMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: result.answer,
        citations: result.citations,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto relative">
      {messages.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-accent/10 text-accent mb-6 shadow-sm">
            <Sparkles className="w-10 h-10" strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-4xl text-text tracking-tight mb-4">
            ChatCB Intelligence
          </h2>
          <p className="text-text-muted mb-10 max-w-lg mx-auto text-lg leading-relaxed">
            Ask anything about cannabis medicine. Powered by 11,000+
            peer-reviewed research papers and our medical database.
          </p>

          <div className="max-w-xl mx-auto mb-10 relative group">
            <div className="absolute inset-0 bg-accent/20 rounded-3xl blur-xl group-focus-within:bg-accent/30 transition-all"></div>
            <div className="relative bg-white p-2 rounded-3xl shadow-xl border border-slate-100 flex items-center">
              <Search
                className="w-6 h-6 text-slate-400 ml-4 mr-2"
                strokeWidth={2}
              />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="Ask anything about cannabis medicine..."
                className="flex-1 h-14 bg-transparent text-lg text-text focus:outline-none"
              />
              <button
                onClick={() => handleSubmit()}
                disabled={!input.trim() || loading}
                aria-label="Ask"
                className="h-14 w-14 rounded-2xl bg-accent text-white flex items-center justify-center hover:bg-accent/90 disabled:opacity-50 transition-all shadow-md transform hover:scale-105 active:scale-95"
              >
                <ArrowRight className="w-6 h-6" strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => handleSubmit(q)}
                className="text-sm font-semibold px-5 py-2.5 rounded-full border-2 border-slate-200 bg-white text-slate-600 hover:border-accent hover:text-accent transition-all hover:-translate-y-0.5 shadow-sm"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6 mb-24">
          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] rounded-3xl px-6 py-5 shadow-sm",
                msg.role === "user"
                  ? "bg-accent text-white rounded-br-sm"
                  : "bg-white border-2 border-slate-100 rounded-bl-sm"
              )}>
                <p className={cn(
                  "text-base leading-relaxed whitespace-pre-wrap font-medium",
                  msg.role === "user" ? "text-white" : "text-slate-800"
                )}>
                  {msg.content}
                </p>

                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Verified Sources</p>
                    {msg.citations.map((c) => {
                      const ev = EVIDENCE_COLORS[c.evidenceLevel];
                      // EMR-179 — every citation deep-links to a real
                      // article view. Prefer PubMed by PMID, then
                      // doi.org by DOI, then a PubMed search by title
                      // when the citation is a synthesized KB entry.
                      const href = c.pmid
                        ? `https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`
                        : c.doi
                          ? `https://doi.org/${c.doi}`
                          : `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(c.title)}`;
                      return (
                        <a
                          key={c.id}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${c.title} in PubMed (new tab)`}
                          className={cn(
                            "block rounded-2xl px-4 py-3 border border-transparent hover:border-accent/40 hover:shadow-sm transition-all group/citation",
                            ev.bg
                          )}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className={cn("font-bold", ev.text)}>{ev.emoji}</span>
                            <span className="font-bold text-slate-800 text-sm group-hover/citation:underline">
                              {c.title} ↗
                            </span>
                            <Badge className="text-[9px] ml-auto font-bold" tone="neutral">{ev.label}</Badge>
                          </div>
                          <p className="text-slate-600 mt-1 leading-relaxed text-xs font-medium">{c.summary.slice(0, 150)}...</p>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* EMR-157 — loading indicator lives in a fixed-height slot
              so the bubble appearing/disappearing doesn't shift the
              scroll position. The reserved height matches the bubble
              padding + line-height so transitioning to/from the
              indicator is layout-stable. */}
          <div
            className="min-h-[72px]"
            aria-live="polite"
            aria-busy={loading || undefined}
          >
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border-2 border-slate-100 rounded-3xl rounded-bl-sm px-6 py-5 shadow-sm">
                  <div className="flex items-center gap-3 text-sm text-slate-500 font-bold">
                    <span className="animate-pulse flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-accent" />
                      Consulting Knowledge Base
                    </span>
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{animationDelay: '0ms'}}></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{animationDelay: '150ms'}}></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{animationDelay: '300ms'}}></span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      )}

      {messages.length > 0 && (
        <div className="fixed bottom-6 left-0 right-0 z-30 px-4">
          <div className="max-w-3xl mx-auto relative group">
             <div className="absolute inset-0 bg-white/60 rounded-full blur-xl backdrop-blur-xl group-focus-within:bg-white/80 transition-all"></div>
             <div className="relative bg-white/90 backdrop-blur-lg p-2 rounded-full shadow-2xl border border-slate-200 flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="Ask a follow-up question..."
                className="flex-1 h-12 bg-transparent text-base font-medium text-text pl-6 focus:outline-none"
              />
              <button
                onClick={() => handleSubmit()}
                disabled={!input.trim() || loading}
                aria-label="Send"
                className="h-12 w-12 rounded-full bg-accent text-white flex items-center justify-center hover:bg-accent/90 disabled:opacity-50 transition-all shadow-md transform hover:scale-105 active:scale-95"
              >
                <ArrowRight className="w-5 h-5" strokeWidth={2.5} />
              </button>
            </div>
            <p className="text-center text-[10px] text-slate-500 mt-3 font-medium tracking-wide">
              ChatCB by Leafjourney &middot; Not medical advice &middot; Always consult your provider
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
