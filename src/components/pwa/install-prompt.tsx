"use client";

/**
 * PWA install prompt — patient + clinician shells.
 *
 * Two platforms, two flows:
 *   1. Android / Chromium  — listens for the standard `beforeinstallprompt`
 *      event, stashes it, then calls `prompt()` when the user clicks
 *      "Install". This is the easy path; the browser handles UI confirm.
 *   2. iOS Safari          — Apple does not fire `beforeinstallprompt`.
 *      Install is manual: Share → Add to Home Screen. We detect iOS +
 *      non-standalone and render a custom instruction sheet with a
 *      labelled diagram.
 *
 * Dismiss persistence: localStorage key `lj.pwa.installPromptDismissedAt`
 * stores an ISO timestamp. We don't re-prompt for 30 days. If the user
 * actually installs (display-mode flips to `standalone` mid-session) we
 * drop the prompt immediately and never show it again on this device.
 *
 * Mount once near the top of clinician + patient layouts; mounting it
 * twice in the same render tree is safe — only the first instance to
 * win the event listener gets the prompt.
 */

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const DISMISS_KEY = "lj.pwa.installPromptDismissedAt";
const SUPPRESS_DAYS = 30;
const SUPPRESS_MS = SUPPRESS_DAYS * 24 * 60 * 60 * 1000;

// Chromium's BeforeInstallPromptEvent isn't in lib.dom.d.ts yet.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

type Platform = "android" | "ios" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  // iPadOS 13+ reports as Mac with touch — disambiguate.
  const isIPadOS =
    /Mac/.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
  if (/iPhone|iPad|iPod/.test(ua) || isIPadOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS exposes `navigator.standalone`; everyone else uses the media query.
  // Cast through unknown — the iOS-only field isn't in standard typings.
  const navStandalone = (navigator as unknown as { standalone?: boolean }).standalone;
  if (navStandalone) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

function isRecentlyDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = new Date(raw).getTime();
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < SUPPRESS_MS;
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, new Date().toISOString());
  } catch {
    // localStorage may be disabled (private browsing on iOS); silently no-op.
  }
}

export function InstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<Platform>("other");
  const [installed, setInstalled] = useState(false);
  const [showIosSheet, setShowIosSheet] = useState(false);
  // Defer first paint until after mount so we never SSR a CTA that
  // tells the user something incorrect about their device.
  const [ready, setReady] = useState(false);
  // iOS banner needs to be shown without an event; gate it behind a
  // small delay so we don't shove the prompt in the user's face on
  // first paint of every navigation.
  const [iosBannerVisible, setIosBannerVisible] = useState(false);

  useEffect(() => {
    setReady(true);
    setPlatform(detectPlatform());
    setInstalled(isStandalone());
  }, []);

  // Listen for the Chromium install event.
  useEffect(() => {
    if (!ready) return;
    const onBeforeInstall = (event: Event) => {
      // Stash the event so we can fire it on user gesture. Browsers
      // require we preventDefault() to keep the deferred prompt alive
      // past this tick.
      event.preventDefault();
      if (isRecentlyDismissed()) return;
      setDeferredEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredEvent(null);
      setIosBannerVisible(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [ready]);

  // For iOS, decide whether to show the static banner. Wait 4s so it
  // doesn't compete with first-paint chrome.
  useEffect(() => {
    if (!ready) return;
    if (platform !== "ios") return;
    if (installed) return;
    if (isRecentlyDismissed()) return;
    const t = window.setTimeout(() => setIosBannerVisible(true), 4000);
    return () => window.clearTimeout(t);
  }, [ready, platform, installed]);

  const handleInstall = useCallback(async () => {
    if (!deferredEvent) return;
    try {
      await deferredEvent.prompt();
      const choice = await deferredEvent.userChoice;
      if (choice.outcome === "dismissed") {
        rememberDismissal();
      }
    } catch {
      // Some browsers throw if `prompt()` is called after the event
      // is consumed. Either way, drop the reference.
    } finally {
      setDeferredEvent(null);
    }
  }, [deferredEvent]);

  const handleDismiss = useCallback(() => {
    rememberDismissal();
    setDeferredEvent(null);
    setIosBannerVisible(false);
  }, []);

  const handleShowIos = useCallback(() => setShowIosSheet(true), []);
  const handleCloseIos = useCallback(() => setShowIosSheet(false), []);

  if (!ready || installed) return null;

  // ---- Android / Chromium native deferred prompt banner ----
  if (deferredEvent) {
    return (
      <InstallBanner
        title="Install LeafJourney"
        copy="One-tap access — feels like a native app."
        primaryLabel="Install"
        onPrimary={handleInstall}
        onDismiss={handleDismiss}
      />
    );
  }

  // ---- iOS Safari custom banner + instructions sheet ----
  if (platform === "ios" && iosBannerVisible) {
    return (
      <>
        <InstallBanner
          title="Add LeafJourney to your Home Screen"
          copy="Tap Share, then Add to Home Screen."
          primaryLabel="Show me"
          onPrimary={handleShowIos}
          onDismiss={handleDismiss}
        />
        {showIosSheet ? <IosInstructionsSheet onClose={handleCloseIos} /> : null}
      </>
    );
  }

  return null;
}

// -----------------------------------------------------------------------------
// Presentational sub-components
// -----------------------------------------------------------------------------

function InstallBanner({
  title,
  copy,
  primaryLabel,
  onPrimary,
  onDismiss,
}: {
  title: string;
  copy: string;
  primaryLabel: string;
  onPrimary: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Install LeafJourney"
      className={cn(
        // Fixed bottom-sheet style so it doesn't push layout around;
        // respects iOS safe-area-inset-bottom so the home indicator
        // doesn't sit on the buttons.
        "fixed inset-x-3 z-[80] bottom-3 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[360px]",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <div
        className={cn(
          "rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-xl",
          "p-4 flex items-start gap-3",
        )}
      >
        <div
          aria-hidden="true"
          className="shrink-0 mt-0.5 h-10 w-10 rounded-xl bg-[color:var(--leaf-soft)] flex items-center justify-center"
        >
          <span className="text-[color:var(--leaf)] text-lg font-semibold">LJ</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[color:var(--text)] leading-tight">
            {title}
          </p>
          <p className="mt-1 text-xs text-[color:var(--text-muted)] leading-snug">{copy}</p>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={onPrimary}>
              {primaryLabel}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IosInstructionsSheet({ onClose }: { onClose: () => void }) {
  // Lock background scroll while the sheet is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape — iPads with keyboards should respect this.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How to install LeafJourney on iOS"
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full sm:max-w-md mx-0 sm:mx-4 bg-[color:var(--surface)] rounded-t-2xl sm:rounded-2xl shadow-2xl",
          "p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[color:var(--text)]">
            Install LeafJourney
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] rounded px-1"
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <ol className="mt-4 space-y-3 text-sm text-[color:var(--text)]">
          <li className="flex gap-3">
            <Step n={1} />
            <span>
              Tap the <ShareIcon /> <strong>Share</strong> button in Safari&apos;s
              toolbar.
            </span>
          </li>
          <li className="flex gap-3">
            <Step n={2} />
            <span>
              Scroll down and tap <strong>Add to Home Screen</strong>.
            </span>
          </li>
          <li className="flex gap-3">
            <Step n={3} />
            <span>
              Tap <strong>Add</strong> in the top right — LeafJourney lives on
              your Home Screen now.
            </span>
          </li>
        </ol>
        <p className="mt-4 text-xs text-[color:var(--text-muted)]">
          Note: Add to Home Screen only works in Safari, not in Chrome or
          in-app browsers.
        </p>
      </div>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 h-6 w-6 rounded-full bg-[color:var(--leaf-soft)] text-[color:var(--leaf)] text-xs font-semibold flex items-center justify-center"
    >
      {n}
    </span>
  );
}

function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      className="inline-block align-[-2px] mx-0.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
