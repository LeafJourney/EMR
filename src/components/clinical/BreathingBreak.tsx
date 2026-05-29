"use client";

// EMR-129 — Provider Breathing Break Popup
// After ~30 minutes of *active charting* a gentle pop-up suggests a
// 60-second breathing exercise. Animated inhale / exhale guide. Snooze /
// dismiss. Tracks break frequency in localStorage so a clinician can see
// how often they actually take the prompt.
//
// The timer measures cumulative *worked* time, not idle time: we only
// accrue minutes while the provider is interacting with the EMR, and we
// stop accruing once they go idle or background the tab. A clinician who
// charts steadily for half an hour gets the nudge; one who steps away
// does not (their clock simply pauses). This is the opposite of an
// idle-timeout — the earlier implementation reset the clock on every
// keystroke and so only ever fired when the provider was already away.

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeafSprig } from "@/components/ui/ornament";
import { cn } from "@/lib/utils/cn";

const ACTIVITY_WINDOW_MS = 30 * 60 * 1000;
const SNOOZE_MS = 5 * 60 * 1000;
const EXERCISE_MS = 60 * 1000;
// How often we poll to roll worked-time forward.
const TICK_MS = 15 * 1000;
// If there has been no interaction within this window when a tick fires,
// the provider is considered idle and that interval does not count as work.
const IDLE_GAP_MS = 60 * 1000;
const INHALE_MS = 4000;
const HOLD_MS = 2000;
const EXHALE_MS = 6000;
const CYCLE_MS = INHALE_MS + HOLD_MS + EXHALE_MS;

const STATS_KEY = "lj-breathing-break-stats";
// Persisted cumulative worked-time (ms) since the last break, so progress
// survives a full page reload rather than restarting from zero.
const WORKED_KEY = "lj-breathing-break-worked-ms";

type Phase = "inhale" | "hold" | "exhale";

interface BreakStats {
  totalCompleted: number;
  totalSnoozed: number;
  totalDismissed: number;
  lastCompletedAt: string | null;
}

function readStats(): BreakStats {
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw) as Partial<BreakStats>;
    return {
      totalCompleted: parsed.totalCompleted ?? 0,
      totalSnoozed: parsed.totalSnoozed ?? 0,
      totalDismissed: parsed.totalDismissed ?? 0,
      lastCompletedAt: parsed.lastCompletedAt ?? null,
    };
  } catch {
    return emptyStats();
  }
}

function emptyStats(): BreakStats {
  return {
    totalCompleted: 0,
    totalSnoozed: 0,
    totalDismissed: 0,
    lastCompletedAt: null,
  };
}

function writeStats(stats: BreakStats) {
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    /* ignore quota */
  }
}

function phaseAt(elapsed: number): { phase: Phase; phaseElapsed: number } {
  const t = elapsed % CYCLE_MS;
  if (t < INHALE_MS) return { phase: "inhale", phaseElapsed: t };
  if (t < INHALE_MS + HOLD_MS)
    return { phase: "hold", phaseElapsed: t - INHALE_MS };
  return { phase: "exhale", phaseElapsed: t - INHALE_MS - HOLD_MS };
}

function scaleFor(phase: Phase, phaseElapsed: number): number {
  if (phase === "inhale") return 0.55 + 0.45 * (phaseElapsed / INHALE_MS);
  if (phase === "hold") return 1.0;
  return 1.0 - 0.45 * (phaseElapsed / EXHALE_MS);
}

interface Props {
  /** Override the activity window for tests / settings. Default 30 min. */
  intervalMs?: number;
  /** Called when the user finishes the 60-second exercise. */
  onComplete?: (stats: BreakStats) => void;
}

export function BreathingBreak({
  intervalMs = ACTIVITY_WINDOW_MS,
  onComplete,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [stats, setStats] = React.useState<BreakStats>(emptyStats);
  // Timestamp of the most recent interaction — used to decide whether the
  // provider was active during the interval we're about to count.
  const lastActivityRef = React.useRef<number>(Date.now());
  // Timestamp of the previous tick, so each tick knows how much wall time
  // to attribute (and we can ignore an oversized gap from a throttled
  // background tab).
  const lastTickRef = React.useRef<number>(Date.now());
  // Cumulative worked time (ms) since the last break / snooze / dismiss.
  const workedMsRef = React.useRef<number>(0);
  const snoozedUntilRef = React.useRef<number>(0);

  const persistWorked = React.useCallback((value: number) => {
    try {
      window.localStorage.setItem(WORKED_KEY, String(Math.round(value)));
    } catch {
      /* ignore quota */
    }
  }, []);

  // Restore stats + accrued worked-time so progress honors the break
  // window across full page reloads. We deliberately do NOT count the
  // reload gap as work: reset the activity/tick clocks to "now".
  React.useEffect(() => {
    setStats(readStats());
    try {
      const raw = window.localStorage.getItem(WORKED_KEY);
      const parsed = raw == null ? 0 : Number(raw);
      workedMsRef.current = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    } catch {
      workedMsRef.current = 0;
    }
    const now = Date.now();
    lastActivityRef.current = now;
    lastTickRef.current = now;
  }, []);

  const recordActivity = React.useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Track interaction so we know when the provider is actively charting.
  React.useEffect(() => {
    const handler = () => recordActivity();
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [recordActivity]);

  // Roll worked-time forward on each tick, but only for intervals during
  // which the provider was actually active. Surface the popup once the
  // accrued work time crosses the window.
  React.useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const sinceTick = now - lastTickRef.current;
      lastTickRef.current = now;
      // Pause the clock while the exercise/prompt is up or during a snooze.
      if (open || running || now < snoozedUntilRef.current) return;
      // Only accrue if there was interaction recently. Cap the credited
      // span so a throttled/backgrounded tab can't bank a huge jump.
      const wasActive = now - lastActivityRef.current <= IDLE_GAP_MS;
      if (!wasActive) return;
      workedMsRef.current += Math.min(sinceTick, TICK_MS * 1.5);
      persistWorked(workedMsRef.current);
      if (workedMsRef.current >= intervalMs) {
        setOpen(true);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [intervalMs, open, running, persistWorked]);

  // Drive the breathing animation while the exercise is active.
  React.useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const id = window.setInterval(() => {
      const e = Date.now() - start;
      setElapsed(e);
      if (e >= EXERCISE_MS) {
        window.clearInterval(id);
        finish();
      }
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function startExercise() {
    setRunning(true);
    setElapsed(0);
  }

  // Clear the worked-time clock so the next nudge is a fresh ~30 min away.
  function resetWorkClock() {
    workedMsRef.current = 0;
    lastTickRef.current = Date.now();
    persistWorked(0);
  }

  function finish() {
    const next: BreakStats = {
      ...stats,
      totalCompleted: stats.totalCompleted + 1,
      lastCompletedAt: new Date().toISOString(),
    };
    setStats(next);
    writeStats(next);
    setRunning(false);
    setOpen(false);
    resetWorkClock();
    onComplete?.(next);
  }

  function snooze() {
    snoozedUntilRef.current = Date.now() + SNOOZE_MS;
    const next = { ...stats, totalSnoozed: stats.totalSnoozed + 1 };
    setStats(next);
    writeStats(next);
    setOpen(false);
    resetWorkClock();
  }

  function dismiss() {
    const next = { ...stats, totalDismissed: stats.totalDismissed + 1 };
    setStats(next);
    writeStats(next);
    setOpen(false);
    resetWorkClock();
  }

  if (!open && !running) return null;

  const { phase, phaseElapsed } = phaseAt(elapsed);
  const scale = scaleFor(phase, phaseElapsed);
  const remaining = Math.max(0, EXERCISE_MS - elapsed);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={running ? undefined : dismiss}
        aria-hidden="true"
      />
      <Card
        tone="raised"
        className="relative z-10 w-full max-w-md p-8 text-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="breathing-break-title"
      >
        {running ? (
          <ExerciseView
            phase={phase}
            scale={scale}
            remaining={remaining}
            onEnd={finish}
          />
        ) : (
          <PromptView
            stats={stats}
            onStart={startExercise}
            onSnooze={snooze}
            onDismiss={dismiss}
          />
        )}
      </Card>
    </div>
  );
}

function PromptView({
  stats,
  onStart,
  onSnooze,
  onDismiss,
}: {
  stats: BreakStats;
  onStart: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}) {
  return (
    <>
      <LeafSprig size={32} className="mx-auto mb-5 text-accent" />
      <h2
        id="breathing-break-title"
        className="font-display text-2xl text-text tracking-tight mb-2"
      >
        Take 60 seconds
      </h2>
      <p className="text-sm text-text-muted leading-relaxed mb-5 max-w-xs mx-auto">
        You have been charting for 30 minutes. A single minute of paced
        breathing resets your nervous system before the next patient.
      </p>
      <div className="flex justify-center gap-2 mb-6">
        <Badge tone="accent" className="text-[10px]">
          {stats.totalCompleted} completed
        </Badge>
        <Badge tone="neutral" className="text-[10px]">
          {stats.totalSnoozed} snoozed
        </Badge>
      </div>
      <div className="flex flex-col gap-2">
        <Button size="lg" className="w-full" onClick={onStart}>
          Start
        </Button>
        <Button size="sm" variant="secondary" onClick={onSnooze}>
          Snooze 5 min
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-text-subtle hover:text-text mt-1 transition-colors"
        >
          Not now
        </button>
      </div>
    </>
  );
}

function ExerciseView({
  phase,
  scale,
  remaining,
  onEnd,
}: {
  phase: Phase;
  scale: number;
  remaining: number;
  onEnd: () => void;
}) {
  const label = phase === "inhale" ? "Inhale" : phase === "hold" ? "Hold" : "Exhale";
  const seconds = Math.ceil(remaining / 1000);
  return (
    <>
      <p className="text-[11px] uppercase tracking-[0.18em] text-text-subtle mb-6">
        {seconds}s left
      </p>
      <div className="flex justify-center mb-8">
        <div
          className={cn(
            "relative h-40 w-40 rounded-full bg-accent-soft flex items-center justify-center",
            "transition-transform ease-in-out",
          )}
          style={{
            transform: `scale(${scale.toFixed(3)})`,
            transitionDuration:
              phase === "inhale"
                ? `${INHALE_MS}ms`
                : phase === "exhale"
                  ? `${EXHALE_MS}ms`
                  : `${HOLD_MS}ms`,
          }}
          aria-hidden="true"
        >
          <LeafSprig size={36} className="text-accent" />
        </div>
      </div>
      <p className="font-display text-3xl text-text tracking-tight">{label}</p>
      <button
        type="button"
        onClick={onEnd}
        className="mt-6 text-xs text-text-subtle hover:text-text transition-colors"
      >
        Finish early
      </button>
    </>
  );
}

export function readBreathingBreakStats(): BreakStats {
  if (typeof window === "undefined") return emptyStats();
  return readStats();
}
