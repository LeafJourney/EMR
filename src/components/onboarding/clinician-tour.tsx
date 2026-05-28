"use client";

/**
 * First-run guided product tour for clinicians.
 *
 * Stripe / Intercom flavor:
 *   • Dim backdrop with a transparent "spotlight" hole punched over the
 *     anchored DOM element.
 *   • Adjacent tooltip card with title, body, progress dots, and the
 *     "Skip / Next" controls.
 *   • Arrow keys + Enter to advance, Esc to skip, click on Skip to dismiss.
 *
 * Triggering rules:
 *   • Auto-shows on the first authenticated render of `/clinic` ONLY when
 *     localStorage flag `emr.tour.clinicianV1` is absent.
 *   • Manual replay path: the keyboard help modal (PR #443) exposes a
 *     "Replay tour" affordance which dispatches the `emr:tour:replay`
 *     CustomEvent. This component listens for that event and re-opens.
 *
 * Anchoring:
 *   • Each step references the target by CSS selector. Most steps lean on
 *     stable `href` / `aria-label` attributes that already exist; the
 *     queue rail + agent fleet + ⌘K search are explicitly marked with
 *     `data-tour="<id>"` on the clinic home page.
 *
 * No deps: pure React + Tailwind. Lives as a SEPARATE z-layer so it does
 * not collide with toasts (#458) or the keyboard help modal (#443).
 */

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

const STORAGE_KEY = "emr.tour.clinicianV1";
const REPLAY_EVENT = "emr:tour:replay";

type Side = "top" | "bottom" | "left" | "right";

interface TourStep {
  /** CSS selector for the spotlight target. */
  selector: string;
  /** Fallback selector if the primary one is not in the DOM. */
  fallbackSelector?: string;
  title: string;
  body: string;
  /** Preferred tooltip placement; falls back automatically near edges. */
  side?: Side;
}

const STEPS: TourStep[] = [
  {
    selector: '[data-tour="logo"]',
    fallbackSelector: 'a[aria-label="Home"]',
    title: "Welcome to LeafJourney",
    body: "Your clinical home base. Click the leaf any time to come back to Today.",
    side: "right",
  },
  {
    selector: '[data-tour="queue"]',
    title: "Today's queue",
    body: "Patients are auto-sorted by AI urgency — the most time-sensitive visits surface first, with a one-line rationale for why.",
    side: "bottom",
  },
  {
    selector: '[data-tour="nav-messages"]',
    fallbackSelector: 'a[href="/clinic/messages"]',
    title: "Smart inbox",
    body: "AI-drafted patient replies wait here, pre-triaged by urgency. You approve, edit, or send — the agent learns from your edits.",
    side: "right",
  },
  {
    selector: '[data-tour="nav-patients"]',
    fallbackSelector: 'a[href="/clinic/patients"]',
    title: "Patient roster",
    body: "Every patient in your panel, with chart readiness scores so you know who is ready to be seen and who still needs intake.",
    side: "right",
  },
  {
    selector: '[data-tour="palette"]',
    fallbackSelector: 'input[type="search"], input[placeholder*="Search" i]',
    title: "Command palette — ⌘K",
    body: "Jump anywhere instantly. Press ⌘K (or Ctrl+K) to search patients, open notes, fire actions, or hop between surfaces.",
    side: "bottom",
  },
  {
    selector: '[data-tour="nav-communications"]',
    fallbackSelector: 'a[href="/clinic/communications"]',
    title: "Communications hub",
    body: "Outbound campaigns, recall lists, broadcast SMS — everything your front office runs without leaving the EMR.",
    side: "right",
  },
  {
    selector: '[data-tour="agent-fleet"]',
    title: "Practice Manager Agent",
    body: "Your AI team at a glance — last 24 hours of agent activity. Click any tile to drill into what each agent did and why.",
    side: "bottom",
  },
];

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Resolve a step's selector against the DOM. */
function findTarget(step: TourStep): HTMLElement | null {
  const candidates = [step.selector, step.fallbackSelector].filter(
    Boolean,
  ) as string[];
  for (const sel of candidates) {
    try {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) return el;
    } catch {
      // Bad selector — skip.
    }
  }
  return null;
}

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const val = window.localStorage.getItem(STORAGE_KEY);
    return val === "null" ? null : val;
  } catch {
    return null;
  }
}

function writeStored(value: "completed" | "skipped" | null) {
  try {
    if (value === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    /* private mode — non-fatal. */
  }
}

export function ClinicianTour() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  // Auto-trigger: only on first authenticated render of `/clinic` (the
  // mission control home), only when the flag is absent. Subsequent renders
  // are no-ops because the flag is set on completion/skip.
  useEffect(() => {
    if (pathname !== "/clinic") {
      setOpen(false);
      return;
    }
    if (readStored()) return;

    // Check if the Quote Welcome Modal is active in the current session.
    // If emr-quote-welcome-shown is not set, the modal will display, so
    // we wait for the dismissal event.
    const isQuoteShowing =
      typeof window !== "undefined" &&
      ((window as any).__emr_quote_showing || !window.sessionStorage.getItem("emr-quote-welcome-shown"));

    if (isQuoteShowing) {
      const handleWelcomeDismissed = () => {
        requestAnimationFrame(() => setOpen(true));
      };
      window.addEventListener("emr:welcome:dismissed", handleWelcomeDismissed);
      return () => {
        window.removeEventListener("emr:welcome:dismissed", handleWelcomeDismissed);
      };
    } else {
      // Defer to next frame so the destination DOM is mounted before we
      // measure the first anchor.
      const id = requestAnimationFrame(() => setOpen(true));
      return () => cancelAnimationFrame(id);
    }
  }, [pathname]);

  // Listen for replay events fired by the keyboard help modal.
  useEffect(() => {
    const onReplay = () => {
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, []);

  // Measure the current target. Re-measures on resize, scroll, and step
  // change. If no target resolves, the tour skips forward gracefully.
  useLayoutEffect(() => {
    if (!open || !step) return;
    const measure = () => {
      const el = findTarget(step);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      // Bring the anchor into view if it's offscreen.
      const fullyVisible =
        r.top >= 0 &&
        r.bottom <= window.innerHeight &&
        r.left >= 0 &&
        r.right <= window.innerWidth;
      if (!fullyVisible) {
        el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      }
    };
    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    // Re-measure shortly after smooth scroll completes.
    const t = window.setTimeout(measure, 350);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      window.clearTimeout(t);
    };
  }, [open, step, index]);

  const close = useCallback(
    (reason: "completed" | "skipped") => {
      writeStored(reason);
      setOpen(false);
      setIndex(0);
    },
    [],
  );

  const next = useCallback(() => {
    if (isLast) {
      close("completed");
      return;
    }
    setIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, [isLast, close]);

  const prev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  // Keyboard: arrow keys advance, Enter advances, Esc skips.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close("skipped");
        return;
      }
      if (e.key === "Enter" || e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        next();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        prev();
        return;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, next, prev, close]);

  // Lock scroll while the tour is up.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const tooltipPos = useMemo(() => {
    if (!rect) {
      // Centered fallback when anchor missing.
      return {
        top: typeof window !== "undefined" ? window.innerHeight / 2 - 100 : 200,
        left: typeof window !== "undefined" ? window.innerWidth / 2 - 180 : 200,
        side: "center" as const,
      };
    }
    const TOOLTIP_W = 360;
    const TOOLTIP_H = 200;
    const GAP = 14;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const side = step?.side ?? "bottom";

    let top = rect.top + rect.height + GAP;
    let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;

    if (side === "top") {
      top = rect.top - TOOLTIP_H - GAP;
    } else if (side === "left") {
      top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
      left = rect.left - TOOLTIP_W - GAP;
    } else if (side === "right") {
      top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
      left = rect.left + rect.width + GAP;
    }

    // Clamp inside viewport with an 8px margin.
    left = Math.max(8, Math.min(left, vw - TOOLTIP_W - 8));
    top = Math.max(8, Math.min(top, vh - TOOLTIP_H - 8));
    return { top, left, side };
  }, [rect, step]);

  if (!open || !step) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="emr-tour-title"
      className="fixed inset-0 z-[60] pointer-events-none"
    >
      {/* Backdrop with spotlight cut-out via SVG mask. Pointer-events on the
          backdrop itself so clicks outside the tooltip dismiss nothing
          accidentally — only the explicit Skip control closes the tour. */}
      <svg
        className="absolute inset-0 h-full w-full pointer-events-auto"
        aria-hidden="true"
      >
        <defs>
          <mask id="emr-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={Math.max(0, rect.left - 8)}
                y={Math.max(0, rect.top - 8)}
                width={rect.width + 16}
                height={rect.height + 16}
                rx={10}
                ry={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(15, 23, 23, 0.55)"
          mask="url(#emr-tour-mask)"
        />
      </svg>

      {/* Outline ring around the spotlight target for extra affordance. */}
      {rect && (
        <div
          className="absolute rounded-[10px] ring-2 ring-[color:var(--accent,#3a7d44)] ring-offset-2 ring-offset-transparent pointer-events-none transition-all duration-200"
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0)",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="absolute pointer-events-auto rounded-xl border border-border bg-surface shadow-2xl"
        style={{ top: tooltipPos.top, left: tooltipPos.left, width: 360 }}
      >
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--accent-soft,#e8f1ea)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent,#3a7d44)]">
              Tip · {index + 1} / {STEPS.length}
            </span>
            <button
              type="button"
              onClick={() => close("skipped")}
              className="text-text-subtle hover:text-text text-xs underline-offset-2 hover:underline"
            >
              Skip tour
            </button>
          </div>
          <h2
            id="emr-tour-title"
            className="mt-2 font-display text-lg text-text tracking-tight leading-snug"
          >
            {step.title}
          </h2>
          <p className="mt-1.5 text-sm text-text-muted leading-relaxed">
            {step.body}
          </p>
          {!rect && (
            <p className="mt-2 text-[11px] italic text-text-subtle">
              (Visit the corresponding surface to see this in context.)
            </p>
          )}
        </div>

        <div className="px-5 pb-4 pt-2 flex items-center justify-between gap-3">
          {/* Progress dots */}
          <div
            className="flex items-center gap-1.5"
            role="tablist"
            aria-label="Tour progress"
          >
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Step ${i + 1}`}
                onClick={() => setIndex(i)}
                className={[
                  "h-1.5 rounded-full transition-all",
                  i === index
                    ? "w-5 bg-[color:var(--accent,#3a7d44)]"
                    : "w-1.5 bg-border-strong hover:bg-text-subtle",
                ].join(" ")}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={prev}
                className="text-xs text-text-subtle hover:text-text px-2 py-1.5"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              autoFocus
              className="rounded-md bg-[color:var(--accent,#3a7d44)] px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent,#3a7d44)]/40"
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>

        <p className="px-5 pb-3 text-[10px] text-text-subtle">
          Arrow keys to navigate · Enter to advance · Esc to skip
        </p>
      </div>
    </div>
  );
}

/**
 * Public helper for other surfaces (e.g. the keyboard help modal) to
 * re-trigger the tour. Imported by `KeyboardHelpModal`'s "Replay tour" link.
 */
export function replayClinicianTour() {
  if (typeof window === "undefined") return;
  // Clear the persisted flag so the tour can run again, then fire the event.
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
  window.dispatchEvent(new CustomEvent(REPLAY_EVENT));
}
