"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

// ─── EMR-122 — In-app live captions + language selector ─────────────────────
//
// An accessibility/localization overlay for the telehealth video frame. It
// uses the browser's built-in Web Speech API (SpeechRecognition) to caption
// the local participant's speech live, on-device — no server round-trip and
// no extra cost. The language selector switches the recognition language so a
// Spanish-speaking patient (or a clinician switching between patients) gets
// captions in their own language.
//
// This is intentionally frontend-only and self-contained:
//   • Degrades to a quiet "not supported" note where the API is missing
//     (Firefox, some embedded webviews) rather than breaking the call.
//   • Captions stay local to the device — nothing is uploaded or persisted,
//     which keeps the surface clear of PHI-handling obligations.
//   • Server-backed, two-way translation of the *other* participant can layer
//     on later by feeding cues into <LiveCaptions cues=… /> instead of the
//     local recognizer.

// The Web Speech API isn't in the DOM lib typings yet, so declare the slice we
// use. Kept local to avoid polluting global types for the rest of the app.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface CaptionLanguage {
  /** BCP-47 tag passed to the recognizer, e.g. "es-ES". */
  code: string;
  /** Name shown in the patient's own language. */
  label: string;
}

export const CAPTION_LANGUAGES: CaptionLanguage[] = [
  { code: "en-US", label: "English" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "pt-BR", label: "Português" },
  { code: "zh-CN", label: "中文" },
  { code: "ar-SA", label: "العربية" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "vi-VN", label: "Tiếng Việt" },
];

const LANG_STORAGE_KEY = "lj-caption-language";

export interface LiveCaptionsProps {
  className?: string;
  /** Start with a specific language (otherwise restores the saved choice). */
  defaultLanguage?: string;
}

export function LiveCaptions({ className, defaultLanguage }: LiveCaptionsProps) {
  const ctor = useMemo(getRecognitionCtor, []);
  const supported = ctor !== null;

  const [enabled, setEnabled] = useState(false);
  const [language, setLanguage] = useState(defaultLanguage ?? "en-US");
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // `enabled` is read inside the recognizer's onend handler, which captures the
  // value at attach time — keep a ref so auto-restart sees the live value.
  const enabledRef = useRef(false);

  // Restore the patient's saved caption language on mount.
  useEffect(() => {
    if (defaultLanguage || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && CAPTION_LANGUAGES.some((l) => l.code === saved)) {
      setLanguage(saved);
    }
  }, [defaultLanguage]);

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onend = null;
      rec.onresult = null;
      rec.onerror = null;
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  // Drive the recognizer off `enabled` + `language`. Re-creating on language
  // change is the supported way to switch recognition language mid-session.
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled || !ctor) {
      stopRecognition();
      setInterimText("");
      return;
    }

    const rec = new ctor();
    rec.lang = language;
    rec.continuous = true;
    rec.interimResults = true;
    recognitionRef.current = rec;

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          setFinalText((prev) => trimCaption(`${prev} ${text}`.trim()));
        } else {
          interim += text;
        }
      }
      setInterimText(interim);
    };

    rec.onerror = (event) => {
      // "no-speech"/"aborted" are routine; only surface a hard stop.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        enabledRef.current = false;
        setEnabled(false);
      }
    };

    // The engine stops itself after a pause; restart while captions are on.
    rec.onend = () => {
      if (enabledRef.current && recognitionRef.current === rec) {
        try {
          rec.start();
        } catch {
          /* will be retried on next toggle */
        }
      }
    };

    try {
      rec.start();
    } catch {
      /* start can throw if called twice; safe to ignore */
    }

    return () => {
      rec.onend = null;
      stopRecognition();
    };
  }, [enabled, language, ctor, stopRecognition]);

  function handleLanguageChange(code: string) {
    setLanguage(code);
    setFinalText("");
    setInterimText("");
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANG_STORAGE_KEY, code);
    }
  }

  if (!supported) {
    return null;
  }

  return (
    <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-10", className)}>
      {/* Caption track — only painted while there's something to show. */}
      {enabled && (finalText || interimText) && (
        <div className="px-4 pb-20 sm:pb-24 flex justify-center">
          <p
            aria-live="polite"
            className="max-w-2xl rounded-lg bg-black/70 px-4 py-2 text-center text-base sm:text-lg font-medium leading-snug text-white shadow-lg backdrop-blur-sm"
          >
            <span>{finalText}</span>
            {interimText && (
              <span className="text-white/60">{finalText ? " " : ""}{interimText}</span>
            )}
          </p>
        </div>
      )}

      {/* Controls — CC toggle + language picker. */}
      <div className="pointer-events-auto absolute bottom-4 left-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          aria-pressed={enabled}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            enabled
              ? "bg-white text-gray-900"
              : "bg-black/60 text-white/90 hover:bg-black/70",
          )}
          title={enabled ? "Turn captions off" : "Turn captions on"}
        >
          <span aria-hidden className="text-sm leading-none">
            {/* CC glyph */}
            {"\u{1F4AC}"}
          </span>
          {enabled ? "Captions on" : "Captions"}
        </button>

        {enabled && (
          <label className="inline-flex items-center">
            <span className="sr-only">Caption language</span>
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="h-9 rounded-full border-0 bg-black/60 px-3 text-xs font-medium text-white/90 backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {CAPTION_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="text-gray-900">
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

// Keep the on-screen caption to a readable two-line-ish tail so it scrolls
// like broadcast captions instead of growing without bound.
function trimCaption(text: string, maxChars = 180): string {
  if (text.length <= maxChars) return text;
  const tail = text.slice(text.length - maxChars);
  const firstSpace = tail.indexOf(" ");
  return firstSpace > 0 ? tail.slice(firstSpace + 1) : tail;
}
