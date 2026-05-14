"use client";

import { useEffect, useState, useTransition } from "react";
import { generateFairytale, type FairytaleResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LeafSprig, EditorialRule } from "@/components/ui/ornament";
import { cn } from "@/lib/utils/cn";
import { ShareButton } from "@/components/portal/share-button";
import { SoundtrackPicker } from "@/components/portal/soundtrack-picker";
import { SHARE_PRESETS } from "@/lib/portal/social-share";

// ---------------------------------------------------------------------------
// Storybook view (v2 polish)
// ---------------------------------------------------------------------------
// Renders the fairytale produced by FairytaleSummaryAgent as a scrollable
// timeline. Adds:
//   • Hero "Your health story"
//   • Chapter timeline with emoji markers
//   • Prev / Next chapter pager (also smoothly scrolls into view)
//   • Save as PDF (window.print(); the print stylesheet handles paging)
// ---------------------------------------------------------------------------

const CHAPTER_EMOJI = ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF3C", "\uD83C\uDF3B", "\uD83C\uDF40", "\uD83C\uDF38", "\uD83C\uDF3A", "\u2728"];

function chapterEmojiFor(index: number, heading: string): string {
  const lower = heading.toLowerCase();
  if (lower.includes("sleep")) return "\uD83C\uDF19";
  if (lower.includes("pain")) return "\uD83E\uDE79";
  if (lower.includes("anxiet") || lower.includes("calm")) return "\uD83C\uDF24\uFE0F";
  if (lower.includes("mood") || lower.includes("joy")) return "\u2600\uFE0F";
  if (lower.includes("visit") || lower.includes("clinic")) return "\uD83E\uDE7A";
  if (lower.includes("garden") || lower.includes("grow")) return "\uD83C\uDF31";
  return CHAPTER_EMOJI[index % CHAPTER_EMOJI.length];
}

export function StorybookView() {
  const [result, setResult] = useState<FairytaleResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [autoRan, setAutoRan] = useState(false);
  const [activeChapter, setActiveChapter] = useState(0);

  // Auto-generate on first mount
  useEffect(() => {
    if (autoRan) return;
    setAutoRan(true);
    startTransition(async () => {
      const r = await generateFairytale();
      setResult(r);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRegenerate() {
    setActiveChapter(0);
    startTransition(async () => {
      const r = await generateFairytale();
      setResult(r);
    });
  }

  function gotoChapter(i: number) {
    setActiveChapter(i);
    if (typeof document !== "undefined") {
      const el = document.getElementById(`storybook-chapter-${i}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function gotoPrev() {
    if (activeChapter > 0) gotoChapter(activeChapter - 1);
  }
  function gotoNext() {
    const max = (result?.story?.chapters.length ?? 1) - 1;
    if (activeChapter < max) gotoChapter(activeChapter + 1);
  }

  function handleSaveAsPdf() {
    if (typeof window !== "undefined") window.print();
  }

  // ── Loading state ────────────────────────────────────────────────
  if (isPending && !result) {
    return (
      <Card tone="ambient" className="text-center py-20">
        <CardContent>
          <div className="flex flex-col items-center gap-5">
            <LeafSprig size={32} className="text-accent animate-pulse" />
            <div>
              <p className="font-display text-xl text-text">
                Writing your story...
              </p>
              <p className="text-sm text-text-muted mt-2">
                The agent is gathering your chart and turning it into a chapter
                of your journey.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Error state ──────────────────────────────────────────────────
  if (result && !result.ok) {
    return (
      <Card tone="raised" className="border-l-4 border-l-danger">
        <CardContent className="py-10 text-center">
          <p className="text-sm text-danger mb-4">{result.error}</p>
          <Button onClick={handleRegenerate} variant="secondary">
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!result?.story) return null;
  const { story } = result;
  const lastIdx = story.chapters.length - 1;

  // ── Rendered story ───────────────────────────────────────────────
  return (
    <div className="space-y-10">
      {/* Hero */}
      <Card tone="ambient" className="text-center py-16 print:break-after-page">
        <CardContent>
          <div className="flex flex-col items-center gap-5">
            <LeafSprig size={36} className="text-accent" />
            <p className="font-display text-[10px] uppercase tracking-[0.2em] text-text-subtle">
              Your health story
            </p>
            <h1 className="font-display text-4xl md:text-5xl text-text tracking-tight leading-tight max-w-2xl">
              {story.title}
            </h1>
            <EditorialRule className="w-32 mt-3" />
          </div>
        </CardContent>
      </Card>

      {/* Opening line */}
      <p className="font-display text-2xl md:text-3xl text-text leading-snug italic text-center max-w-2xl mx-auto px-6">
        &ldquo;{story.openingLine}&rdquo;
      </p>

      {/* Soundtrack picker (EMR-074) */}
      <div className="max-w-2xl mx-auto px-6">
        <SoundtrackPicker chapterHeadings={story.chapters.map((c) => c.heading)} />
      </div>

      {/* Chapter timeline (jump nav) */}
      <nav
        aria-label="Chapter timeline"
        className="flex flex-wrap justify-center gap-2 print:hidden"
      >
        {story.chapters.map((c, i) => {
          const emoji = chapterEmojiFor(i, c.heading);
          const isActive = activeChapter === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => gotoChapter(i)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs transition-all",
                isActive
                  ? "bg-accent-soft border-accent text-accent shadow-sm"
                  : "bg-surface border-border text-text-muted hover:border-accent/50 hover:text-text",
              )}
            >
              <span aria-hidden="true">{emoji}</span>
              <span className="font-medium">Ch. {i + 1}</span>
            </button>
          );
        })}
      </nav>

      <EditorialRule />

      {/* Chapters */}
      <div className="space-y-16 max-w-2xl mx-auto px-6">
        {story.chapters.map((chapter, i) => {
          const emoji = chapterEmojiFor(i, chapter.heading);
          return (
            <article
              key={i}
              id={`storybook-chapter-${i}`}
              className="space-y-4 scroll-mt-24"
            >
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center shrink-0 print:hidden">
                  <span className="text-3xl" aria-hidden="true">
                    {emoji}
                  </span>
                  <span className="font-display text-2xl text-accent/40 mt-1">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-accent">
                    Chapter {i + 1} ·{" "}
                    {new Date(story.generatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  <h2 className="font-display text-2xl md:text-3xl text-text tracking-tight">
                    {chapter.heading}
                  </h2>
                </div>
              </div>
              <p className="text-[17px] text-text-muted leading-relaxed first-letter:font-display first-letter:text-4xl first-letter:text-accent first-letter:float-left first-letter:mr-2 first-letter:mt-1">
                {chapter.body}
              </p>
            </article>
          );
        })}
      </div>

      <EditorialRule />

      {/* Closing line */}
      <p className="font-display text-xl md:text-2xl text-text leading-snug italic text-center max-w-xl mx-auto px-6">
        &mdash; {story.closingLine}
      </p>

      {/* Chapter pager */}
      <div className="flex flex-wrap items-center justify-between gap-3 max-w-2xl mx-auto px-6 print:hidden">
        <Button
          variant="secondary"
          size="sm"
          onClick={gotoPrev}
          disabled={activeChapter === 0}
        >
          &larr; Previous chapter
        </Button>
        <p className="text-xs text-text-subtle tabular-nums">
          Chapter {activeChapter + 1} of {story.chapters.length}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={gotoNext}
          disabled={activeChapter >= lastIdx}
        >
          Next chapter &rarr;
        </Button>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-8 print:hidden">
        <Button onClick={handleSaveAsPdf} variant="primary">
          Save as PDF
        </Button>
        <Button onClick={handleRegenerate} variant="secondary" disabled={isPending}>
          {isPending ? "Writing..." : "Generate a new chapter"}
        </Button>
        <ShareButton
          milestone={SHARE_PRESETS.storybook(story.chapters.length)}
          label="Share story"
        />
      </div>

      {/* Generation footer */}
      <p className="text-[11px] text-text-subtle text-center">
        Written {new Date(story.generatedAt).toLocaleString()} ·{" "}
        {(result.durationMs / 1000).toFixed(1)}s
      </p>
    </div>
  );
}
