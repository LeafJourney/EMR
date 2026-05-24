"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyboardHelpModal } from "@/components/ui/keyboard-help-modal";
import {
  G_LEADER_ROUTES,
  focusPageSearch,
  isTypingTarget,
} from "@/lib/ui/keyboard";

/**
 * Global keyboard shortcuts for the authenticated clinician shell.
 *
 * This component owns the *single-listener* surface for app-wide hotkeys:
 *
 *   • `?`              → open the keyboard help cheat sheet (Linear-style)
 *   • `/`              → focus the page's primary search input (if any)
 *   • `g <x>`          → two-key nav sequence (g h, g m, g p, g s, …)
 *   • `Esc`            → dismiss the cheat sheet
 *
 * `Cmd+K` / `Ctrl+K` is owned by `CommandPalette`; we do not handle it here.
 *
 * List-scoped bindings (`j`/`k`/`Enter`) are NOT handled here — surfaces opt
 * in via `useHotkey` from `src/lib/ui/keyboard.ts`. That keeps each list in
 * charge of its own focus model.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const [leaderActive, setLeaderActive] = useState(false);

  useEffect(() => {
    let leaderTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearLeader = () => {
      if (leaderTimeout) clearTimeout(leaderTimeout);
      leaderTimeout = null;
      setLeaderActive(false);
    };

    const handler = (e: KeyboardEvent) => {
      // Always allow Escape, even from inside fields, to close our modal.
      if (e.key === "Escape") {
        if (helpOpen) {
          setHelpOpen(false);
          e.preventDefault();
        }
        clearLeader();
        return;
      }

      // Modifier-laden combos belong to CommandPalette / browser / OS.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Don't fight with form fields.
      if (isTypingTarget(e.target)) return;

      // Slash → focus the page's search input (if any).
      if (e.key === "/") {
        if (focusPageSearch()) e.preventDefault();
        return;
      }

      // Question mark (typically shift+/) → toggle help.
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // Leader key handling
      if (leaderActive) {
        const target = G_LEADER_ROUTES[e.key.toLowerCase()];
        if (target) {
          e.preventDefault();
          router.push(target);
        }
        clearLeader();
        return;
      }

      if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        setLeaderActive(true);
        leaderTimeout = setTimeout(clearLeader, 1500);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (leaderTimeout) clearTimeout(leaderTimeout);
    };
  }, [router, helpOpen, leaderActive]);

  return (
    <>
      {leaderActive && <LeaderHint />}
      <KeyboardHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

function LeaderHint() {
  return (
    <div className="fixed bottom-4 right-4 z-40 pointer-events-none">
      <div className="rounded-full bg-text/85 text-bg px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur">
        <span className="font-mono mr-1">g</span> awaiting next key…
      </div>
    </div>
  );
}
