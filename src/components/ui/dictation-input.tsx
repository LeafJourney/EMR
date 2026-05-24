"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { useDictation } from "@/components/ui/dictation";
import { Input, Textarea } from "@/components/ui/input";

// EMR — UX dictation primitive (mic-icon dictation wrappers).
//
// `DictationInput` and `DictationTextarea` are drop-in replacements for
// the standard `<Input>` / `<Textarea>` from components/ui/input.tsx.
// They render a small mic button anchored to the right edge of the field
// and stream Web Speech API transcription back into the input via the
// controlled `onChange` handler.
//
// CRITICAL DOMAIN CONSTRAINT (CLAUDE.md / Doc 1 + Doc 3):
//   The SOAP/APSO "Objective" section (and vitals) is *human-authored
//   only*. AI must never generate Objective content. Voice dictation
//   spoken by the clinician is technically human-authored, but to keep
//   the gate symmetric with the rest of the no-AI-in-Objective rule —
//   and to avoid clinicians accidentally treating dictated text as
//   "the system filled it in" — we expose `omitForObjective`. When that
//   prop is true, the mic button is fully suppressed and the field
//   renders as a plain controlled input.
//
// Browser support:
//   - Chrome / Edge desktop (webkitSpeechRecognition / SpeechRecognition)
//   - Safari iOS 14.5+ (webkitSpeechRecognition)
//   - Firefox: SpeechRecognition not implemented → mic is hidden via the
//     `status === "unsupported"` short-circuit (no broken UI)

type CommonProps = {
  value: string;
  onChange: (next: string) => void;
  /**
   * Load-bearing per Dr. Patel: when true, suppress the mic affordance
   * so this input can be used inside the SOAP/APSO Objective section
   * (or vitals) without offering any dictation-driven content path.
   */
  omitForObjective?: boolean;
  /** Tooltip / aria override for the mic button. Defaults to "Dictate". */
  dictateLabel?: string;
  className?: string;
};

// ---------------------------------------------------------------------------
// Screen-reader live announcer — broadcasts "Dictation started" /
// "Dictation stopped" so non-sighted users get parity with the visual
// pulse on the mic button.
// ---------------------------------------------------------------------------

function LiveAnnouncer({ message }: { message: string }) {
  return (
    <span
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid="dictation-live-region"
    >
      {message}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mic button + recording timer, sized for absolute-positioning into the
// padded-right area of a text field.
// ---------------------------------------------------------------------------

function MicGlyph({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
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

interface MicAffordanceProps {
  value: string;
  onChange: (next: string) => void;
  dictateLabel: string;
  className?: string;
}

function MicAffordance({
  value,
  onChange,
  dictateLabel,
  className,
}: MicAffordanceProps) {
  const [elapsed, setElapsed] = React.useState(0);

  const handleFinal = React.useCallback(
    (chunk: string) => {
      const trimmed = chunk.trim();
      if (!trimmed) return;
      const sep = value && !/\s$/.test(value) ? " " : "";
      onChange(`${value}${sep}${trimmed}`);
    },
    [value, onChange],
  );

  const { status, toggle } = useDictation({ onFinal: handleFinal });

  // Recording timer — visible while listening, resets on stop.
  React.useEffect(() => {
    if (status !== "listening") {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [status]);

  // Fallback when browser lacks the API → render nothing. Brief is
  // explicit: don't show broken UI in Firefox.
  if (status === "unsupported") {
    return null;
  }

  const isListening = status === "listening";
  const isDenied = status === "denied";

  const tooltip = isDenied
    ? "Microphone permission denied"
    : isListening
      ? "Stop dictating"
      : dictateLabel;

  const announce = isListening
    ? "Dictation started"
    : elapsed > 0
      ? "Dictation stopped"
      : "";

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        title={tooltip}
        aria-label={tooltip}
        aria-pressed={isListening}
        className={cn(
          "inline-flex h-7 items-center justify-center gap-1 rounded-md px-1.5 transition-colors shrink-0",
          isListening
            ? "bg-danger/15 text-danger ring-1 ring-danger/40 animate-pulse"
            : "text-text-subtle hover:text-accent hover:bg-surface-muted",
          isDenied && "opacity-50",
          className,
        )}
      >
        <MicGlyph active={isListening} />
        {isListening && (
          <span className="text-[10px] font-medium tabular-nums">
            {String(Math.floor(elapsed / 60)).padStart(1, "0")}:
            {String(elapsed % 60).padStart(2, "0")}
          </span>
        )}
      </button>
      <LiveAnnouncer message={announce} />
    </>
  );
}

// ---------------------------------------------------------------------------
// DictationInput — wraps <Input>
// ---------------------------------------------------------------------------

export interface DictationInputProps
  extends CommonProps,
    Omit<
      React.InputHTMLAttributes<HTMLInputElement>,
      "value" | "onChange" | "className"
    > {}

export const DictationInput = React.forwardRef<
  HTMLInputElement,
  DictationInputProps
>(function DictationInput(
  {
    value,
    onChange,
    omitForObjective,
    dictateLabel = "Dictate",
    className,
    placeholder,
    // iOS hint: enables the native iOS dictation key affordance on the
    // soft keyboard for fields used by hand-typing clinicians.
    inputMode,
    ...rest
  },
  ref,
) {
  return (
    <div className="relative w-full">
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        // Reserve right padding only when the mic is showing.
        className={cn(omitForObjective ? "" : "pr-10", className)}
        // Surface to inspectors / e2e harnesses that this field is part
        // of the Objective gate so we can prove the gate's presence.
        data-objective-gated={omitForObjective ? "true" : undefined}
        {...rest}
      />
      {!omitForObjective && (
        <span className="pointer-events-auto absolute right-1.5 top-1/2 -translate-y-1/2">
          <MicAffordance
            value={value}
            onChange={onChange}
            dictateLabel={dictateLabel}
          />
        </span>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// DictationTextarea — wraps <Textarea>
// ---------------------------------------------------------------------------

export interface DictationTextareaProps
  extends CommonProps,
    Omit<
      React.TextareaHTMLAttributes<HTMLTextAreaElement>,
      "value" | "onChange" | "className"
    > {}

export const DictationTextarea = React.forwardRef<
  HTMLTextAreaElement,
  DictationTextareaProps
>(function DictationTextarea(
  {
    value,
    onChange,
    omitForObjective,
    dictateLabel = "Dictate",
    className,
    placeholder,
    rows = 4,
    ...rest
  },
  ref,
) {
  return (
    <div className="relative w-full">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={cn(omitForObjective ? "" : "pr-10", className)}
        data-objective-gated={omitForObjective ? "true" : undefined}
        {...rest}
      />
      {!omitForObjective && (
        <span className="pointer-events-auto absolute right-1.5 top-2">
          <MicAffordance
            value={value}
            onChange={onChange}
            dictateLabel={dictateLabel}
          />
        </span>
      )}
    </div>
  );
});
