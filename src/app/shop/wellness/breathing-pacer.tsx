"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Play, Pause, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BREATH_PATTERNS, type BreathPattern } from "./wellness-data";

// EMR-339 — Interactive breathing pacer. An expanding/contracting circle that
// walks through inhale → hold → exhale phases for box breathing (4-4-4-4) and a
// 4-7-8 option. Respects prefers-reduced-motion via framer-motion's
// useReducedMotion(): when reduced, the circle holds a calm static size and we
// surface the phase + a gentle countdown in text only.

/** Visual scale the circle settles at for each phase label. */
function targetScaleFor(label: string): number {
  if (label.startsWith("Breathe in")) return 1;
  if (label.startsWith("Breathe out")) return 0.62;
  // Holds keep whatever size the previous phase reached; we approximate by
  // resolving from the label that precedes a hold at call sites. As a safe
  // default a hold stays expanded.
  return 0.9;
}

export function BreathingPacer() {
  const reduceMotion = useReducedMotion() ?? false;

  const [patternId, setPatternId] = React.useState<string>(BREATH_PATTERNS[0].id);
  const [running, setRunning] = React.useState(false);
  const [phaseIndex, setPhaseIndex] = React.useState(0);
  const [remaining, setRemaining] = React.useState(0);

  const pattern: BreathPattern =
    BREATH_PATTERNS.find((p) => p.id === patternId) ?? BREATH_PATTERNS[0];
  const phases = pattern.phases;
  const currentPhase = phases[phaseIndex] ?? phases[0];

  // Reset the cycle whenever the pattern changes or we stop.
  React.useEffect(() => {
    setPhaseIndex(0);
    setRemaining(phases[0]?.seconds ?? 0);
  }, [patternId, phases]);

  // Drive the cycle with a 1s tick. Avoids Math.random; fully deterministic.
  React.useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r > 1) return r - 1;
        // Advance to the next phase, wrapping around the cycle.
        setPhaseIndex((idx) => {
          const next = (idx + 1) % phases.length;
          return next;
        });
        return -1; // sentinel: re-seeded below from the new phase
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, phases]);

  // When the phase index changes (or we (re)start), seed the countdown for it.
  React.useEffect(() => {
    if (!running) return;
    setRemaining(phases[phaseIndex]?.seconds ?? 0);
  }, [phaseIndex, running, phases]);

  function toggle() {
    setRunning((r) => {
      const next = !r;
      if (next) {
        setPhaseIndex(0);
        setRemaining(phases[0]?.seconds ?? 0);
      }
      return next;
    });
  }

  // Resolve the animated target. For a hold we look back to the last
  // breathe-in / breathe-out phase so the circle stays put during the hold.
  function resolveScale(idx: number): number {
    const label = phases[idx]?.label ?? "";
    if (label.startsWith("Hold")) {
      for (let i = idx - 1; i >= 0; i--) {
        const l = phases[i]?.label ?? "";
        if (l.startsWith("Breathe")) return targetScaleFor(l);
      }
      return 0.9;
    }
    return targetScaleFor(label);
  }

  const activeScale = running ? resolveScale(phaseIndex) : 0.82;
  const phaseSeconds = currentPhase?.seconds ?? 4;

  const phaseLabel = running ? currentPhase?.label ?? "Ready" : "Ready when you are";

  return (
    <div className="flex flex-col items-center gap-7">
      {/* Pattern switcher — large touch targets. */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {BREATH_PATTERNS.map((p) => {
          const selected = p.id === patternId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setRunning(false);
                setPatternId(p.id);
              }}
              aria-pressed={selected}
              className={[
                "min-h-11 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200",
                selected
                  ? "bg-accent text-accent-ink shadow-sm"
                  : "bg-surface-muted text-text-muted hover:bg-surface-raised hover:text-text",
              ].join(" ")}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {/* The pacer circle. */}
      <div className="relative flex h-60 w-60 items-center justify-center sm:h-72 sm:w-72">
        {/* Soft halo */}
        <div
          aria-hidden="true"
          className="absolute inset-4 rounded-full bg-accent-soft blur-2xl opacity-60"
        />
        {reduceMotion ? (
          // Reduced motion: a calm, static ring. No animation.
          <div
            className="relative flex h-44 w-44 items-center justify-center rounded-full border border-accent/30 bg-gradient-to-b from-accent-soft to-surface sm:h-52 sm:w-52"
          >
            <span className="font-display text-lg tracking-tight text-text">
              {phaseLabel}
            </span>
          </div>
        ) : (
          <motion.div
            className="relative flex h-44 w-44 items-center justify-center rounded-full border border-accent/30 bg-gradient-to-b from-accent-soft to-surface sm:h-52 sm:w-52"
            animate={{ scale: activeScale }}
            transition={{
              duration: running ? phaseSeconds : 0.8,
              ease: "easeInOut",
            }}
          >
            <span className="font-display text-lg tracking-tight text-text">
              {phaseLabel}
            </span>
          </motion.div>
        )}
      </div>

      {/* Phase + countdown read-out. */}
      <div className="flex flex-col items-center gap-2 text-center">
        <Badge tone="accent">
          <Wind width={12} height={12} aria-hidden="true" />
          {pattern.name}
        </Badge>
        <p className="text-[13px] text-text-muted" aria-live="polite">
          {running
            ? `${currentPhase?.label ?? ""} · ${Math.max(remaining, 0)}s`
            : pattern.summary}
        </p>
      </div>

      {/* Start / stop — large touch target. */}
      <Button
        size="lg"
        variant={running ? "secondary" : "primary"}
        onClick={toggle}
        leadingIcon={
          running ? (
            <Pause width={18} height={18} />
          ) : (
            <Play width={18} height={18} />
          )
        }
        className="min-w-44"
      >
        {running ? "Pause" : "Begin breathing"}
      </Button>
    </div>
  );
}
