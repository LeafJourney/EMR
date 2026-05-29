"use client";

/**
 * Whole-visit dictation for the note editor.
 *
 * The clinician starts one continuous dictation and speaks the visit, using
 * spoken section cues ("Subjective… Assessment… Plan…"). Speech streams live
 * into the matching SOAP blocks via the existing browser-speech hook
 * (useDictation) and the deterministic section parser (splitIntoApsoSections).
 *
 * Objective is gated by a per-physician setting: practices often have staff
 * document vitals, so by default Objective speech is captured-but-not-filed and
 * surfaced as a hint. Toggle it on for the "reading the vitals out loud" case.
 * (AI *generation* for Objective stays disabled elsewhere — this only governs
 * the physician's own dictation.)
 */

import * as React from "react";
import { useDictation } from "@/components/ui/dictation";
import { splitIntoApsoSections } from "@/lib/clinical/voice-dictation";
import {
  routeDictationToBlocks,
  type SoapRoutableBlock,
} from "@/lib/clinical/dictation-routing";
import type { NoteBlockType } from "@/lib/domain/notes";
import { cn } from "@/lib/utils/cn";

interface SoapDictationProps {
  /** Whether the physician's dictation may write into the Objective section. */
  includeObjective: boolean;
  /** Persist + reflect a change to the Objective opt-in. */
  onToggleObjective: (next: boolean) => void;
  /** Fired when dictation starts — editor snapshots base bodies + ensures SOAP blocks. */
  onStart: () => void;
  /** Fired on each transcript update with routed section text keyed by block type. */
  onSections: (byType: Partial<Record<NoteBlockType, string>>) => void;
  /** Fired when dictation stops. */
  onStop?: () => void;
  disabled?: boolean;
}

export function SoapDictation({
  includeObjective,
  onToggleObjective,
  onStart,
  onSections,
  onStop,
  disabled,
}: SoapDictationProps) {
  const transcriptRef = React.useRef("");
  const includeObjRef = React.useRef(includeObjective);
  const [interim, setInterim] = React.useState("");
  const [skipped, setSkipped] = React.useState("");

  React.useEffect(() => {
    includeObjRef.current = includeObjective;
  }, [includeObjective]);

  const route = React.useCallback(
    (includeObj: boolean) => {
      const sectioned = splitIntoApsoSections(transcriptRef.current);
      const { byType, skippedObjective } = routeDictationToBlocks(sectioned, {
        includeObjective: includeObj,
      });
      onSections(byType);
      setSkipped(skippedObjective);
    },
    [onSections],
  );

  const handleFinal = React.useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      transcriptRef.current = transcriptRef.current
        ? `${transcriptRef.current} ${t}`
        : t;
      setInterim("");
      route(includeObjRef.current);
    },
    [route],
  );

  const { status, start, stop } = useDictation({
    onFinal: handleFinal,
    onInterim: setInterim,
  });

  const listening = status === "listening";
  const unsupported = status === "unsupported";
  const denied = status === "denied";

  function toggleDictation() {
    if (listening) {
      stop();
      setInterim("");
      onStop?.();
    } else {
      transcriptRef.current = "";
      setSkipped("");
      setInterim("");
      onStart();
      start();
    }
  }

  function toggleObjective() {
    const next = !includeObjective;
    onToggleObjective(next);
    // Re-route the transcript so far against the new setting, so flipping it
    // mid-visit immediately files (or unfiles the hint for) Objective.
    if (transcriptRef.current) route(next);
  }

  return (
    <div className="rounded-xl border border-border bg-surface-raised/60 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={disabled || unsupported ? undefined : toggleDictation}
            disabled={disabled || unsupported}
            aria-pressed={listening}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 h-9 text-sm font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              listening
                ? "bg-danger/15 text-danger animate-pulse"
                : "bg-accent text-accent-ink hover:opacity-90",
              (disabled || unsupported) && "opacity-40 cursor-not-allowed",
            )}
          >
            <MicIcon listening={listening} />
            {listening ? "Stop dictating" : "Dictate visit"}
          </button>
          <span className="text-[11px] text-text-subtle">
            {unsupported
              ? "Dictation isn't supported in this browser."
              : denied
                ? "Microphone permission denied."
                : listening
                  ? "Listening — say “Subjective…”, “Assessment…”, “Plan…” to route sections."
                  : "Speak the visit; cue words file each SOAP section automatically."}
          </span>
        </div>

        {/* Objective opt-in (the per-physician setting) */}
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <span className="text-[11px] text-text-muted">
            Dictate Objective {includeObjective ? "(vitals)" : "(staff documents)"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={includeObjective}
            aria-label="Dictate the Objective section"
            onClick={toggleObjective}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              includeObjective ? "bg-accent" : "bg-surface-muted border border-border",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none inline-block size-4 transform rounded-full bg-white shadow transition",
                includeObjective ? "translate-x-4" : "translate-x-0.5",
                "mt-0.5",
              )}
            />
          </button>
        </label>
      </div>

      {/* Live interim ("hearing") preview */}
      {listening && interim && (
        <p className="text-xs text-text-subtle italic leading-relaxed">
          …{interim}
        </p>
      )}

      {/* Objective captured-but-not-filed notice */}
      {skipped && !includeObjective && (
        <div className="flex items-start gap-2 rounded-md border border-border/60 bg-surface px-2.5 py-1.5 text-[11px] text-text-muted">
          <span aria-hidden="true" className="shrink-0">🩺</span>
          <span className="leading-relaxed">
            Heard Objective/vitals but didn’t file them — your staff documents
            this section. Turn on <span className="font-medium">Dictate Objective</span> to
            capture it here.
          </span>
        </div>
      )}
    </div>
  );
}

function MicIcon({ listening }: { listening: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill={listening ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

export type { SoapRoutableBlock };
