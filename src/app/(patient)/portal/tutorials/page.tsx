"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import {
  TUTORIAL_CATEGORIES,
  TUTORIAL_VIDEOS,
  type TutorialVideo,
  formatDuration,
  groupByCategory,
  readProgress,
  markWatched,
  completionStats,
  isCompleted,
  type TutorialProgress,
} from "@/lib/education/tutorial-videos";

// ---------------------------------------------------------------------------
// EMR-100 — AI Tutorial Videos
// ---------------------------------------------------------------------------
// A patient-friendly catalog of short tutorials. Big thumbnail cards,
// 3rd-grade descriptions, and a tiny progress badge per category. The
// player itself is a stub modal — the real video URLs land later, but
// the surface, progress tracking, and category structure are wired.
// ---------------------------------------------------------------------------

export default function TutorialsPage() {
  const groups = useMemo(() => groupByCategory(TUTORIAL_VIDEOS), []);
  const [progress, setProgress] = useState<TutorialProgress>({ watched: {} });
  const [open, setOpen] = useState<TutorialVideo | null>(null);

  useEffect(() => {
    setProgress(readProgress());
  }, []);

  const overall = completionStats(progress, TUTORIAL_VIDEOS);

  function handleOpen(video: TutorialVideo) {
    setOpen(video);
    // Optimistically mark the video as 25% watched the moment they tap
    // play. The modal closer marks it 100%. This is a pragmatic stand-in
    // for real <video> playback events.
    setProgress(markWatched(video.id, Math.max(progress.watched[video.id] ?? 0, 25)));
  }

  function handleClose(completed: boolean) {
    if (open && completed) {
      setProgress(markWatched(open.id, 100));
    }
    setOpen(null);
  }

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PatientSectionNav section="health" />

      <div className="mb-10 text-center">
        <Eyebrow className="justify-center mb-3">Quick lessons</Eyebrow>
        <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight">
          Show me how
        </h1>
        <p className="text-sm text-text-muted mt-3 max-w-md mx-auto leading-relaxed">
          Short videos that walk you through the parts of LeafJourney
          you actually use. Tap any card to play.
        </p>
        <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-border bg-surface-raised px-5 py-2 shadow-sm">
          <span className="text-base">📺</span>
          <span className="text-sm text-text">
            {overall.completed} of {overall.total} watched
          </span>
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-muted">
            <span
              className="block h-full bg-accent transition-all"
              style={{ width: `${overall.percent}%` }}
              aria-hidden
            />
          </span>
          <span className="text-xs text-text-subtle tabular-nums">
            {overall.percent}%
          </span>
        </div>
      </div>

      <EditorialRule />

      <div className="space-y-12 mt-10">
        {groups.map(({ category, videos }) => {
          const stats = completionStats(progress, videos);
          return (
            <section key={category.id} aria-labelledby={`cat-${category.id}`}>
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <h2
                    id={`cat-${category.id}`}
                    className="font-display text-2xl text-text tracking-tight flex items-center gap-3"
                  >
                    <span aria-hidden className="text-2xl">
                      {category.emoji}
                    </span>
                    {category.title}
                  </h2>
                  <p className="text-sm text-text-muted mt-1.5">
                    {category.blurb}
                  </p>
                </div>
                <div className="text-[11px] text-text-subtle whitespace-nowrap">
                  {stats.completed}/{stats.total} done
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {videos.map((video) => (
                  <TutorialCard
                    key={video.id}
                    video={video}
                    completed={isCompleted(progress, video.id)}
                    watchedPercent={progress.watched[video.id] ?? 0}
                    onPlay={() => handleOpen(video)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {open && <PlayerModal video={open} onClose={handleClose} />}
    </PageShell>
  );
}

function TutorialCard({
  video,
  completed,
  watchedPercent,
  onPlay,
}: {
  video: TutorialVideo;
  completed: boolean;
  watchedPercent: number;
  onPlay: () => void;
}) {
  return (
    <Card
      tone="raised"
      className="overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <button
        type="button"
        onClick={onPlay}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-xl"
      >
        <div
          className={`${video.thumbnailBg} relative h-36 flex items-center justify-center`}
        >
          <span aria-hidden className="text-6xl drop-shadow-sm">
            {video.emoji}
          </span>
          <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums">
            {formatDuration(video.durationSeconds)}
          </span>
          <span className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg">
              <PlayIcon />
            </span>
          </span>
          {completed && (
            <span className="absolute top-2 left-2 rounded-full bg-emerald-500/95 px-2.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
              ✓ Watched
            </span>
          )}
        </div>
        <CardContent className="py-4 px-5">
          <h3 className="font-display text-base text-text tracking-tight mb-1.5">
            {video.title}
          </h3>
          <p className="text-[13px] text-text-muted leading-relaxed line-clamp-3">
            {video.description}
          </p>
          {watchedPercent > 0 && watchedPercent < 90 && (
            <span className="mt-3 block h-1 overflow-hidden rounded-full bg-surface-muted">
              <span
                className="block h-full bg-accent"
                style={{ width: `${watchedPercent}%` }}
                aria-hidden
              />
            </span>
          )}
        </CardContent>
      </button>
    </Card>
  );
}

function PlayerModal({
  video,
  onClose,
}: {
  video: TutorialVideo;
  onClose: (completed: boolean) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Tutorial: ${video.title}`}
      className="fixed inset-0 z-[110] flex items-center justify-center px-4"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onClose(false)}
      />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-surface-raised shadow-2xl">
        <div
          className={`${video.thumbnailBg} flex aspect-video items-center justify-center`}
        >
          {video.videoUrl ? (
            <video
              src={video.videoUrl}
              controls
              autoPlay
              className="h-full w-full bg-black"
              onEnded={() => onClose(true)}
            />
          ) : (
            <div className="text-center px-6">
              <span aria-hidden className="text-7xl block mb-4">
                {video.emoji}
              </span>
              <p className="text-sm text-text-muted max-w-sm mx-auto leading-relaxed">
                Your video tour is on the way. In the meantime, here is a
                preview of what you will learn.
              </p>
            </div>
          )}
        </div>
        <div className="px-6 py-5">
          <h2 className="font-display text-2xl text-text tracking-tight mb-2">
            {video.title}
          </h2>
          <p className="text-sm text-text-muted leading-relaxed">
            {video.description}
          </p>

          {video.learnings && video.learnings.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {video.learnings.map((l, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-text-muted"
                >
                  <span className="text-accent mt-0.5">✓</span>
                  {l}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex items-center justify-between">
            <span className="text-[11px] text-text-subtle">
              {formatDuration(video.durationSeconds)} · Tap done when you finish
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onClose(false)}
                className="rounded-md px-3 h-9 text-sm text-text-muted hover:text-text"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => onClose(true)}
                className="rounded-md bg-accent text-accent-ink px-4 h-9 text-sm font-medium hover:brightness-105"
              >
                I watched it
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
