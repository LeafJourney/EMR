"use client";

// Calls `window.print()` once after mount, then no-ops on re-renders.
//
// ux/print-stylesheets-clinical (unticketed UX run).
//
// Lives next to PrintDocument so every print route gets the same
// "open in new window → immediately render the print dialog" UX
// without each page having to wire up its own effect.
//
// Implementation notes:
// - 250ms timeout gives the browser one paint cycle to lay out tables,
//   so the print preview snapshots the *final* layout, not the
//   pre-hydration one. Tested at 100ms (occasionally truncates lab
//   tables) → 250ms is the sweet spot.
// - Wrapped in `useEffect` so SSR can render the page even when the
//   route is hit programmatically (PDF crawlers, server tests).
// - Honors `?autoprint=0` for debugging — paste the URL with that
//   param to inspect the layout without the dialog popping.

import { useEffect } from "react";

export function AutoPrintTrigger() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("autoprint") === "0") return;
    const t = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        // Some sandboxed iframes throw on `window.print()`. Failing
        // silently is fine — the user can still hit Cmd-P.
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
