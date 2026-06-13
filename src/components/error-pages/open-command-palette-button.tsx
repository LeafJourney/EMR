"use client";

import { Button } from "@/components/ui/button";
import { openCommandPalette } from "@/components/ui/command-palette";

/**
 * Tiny client-side CTA used inside error / not-found screens to surface
 * the global command palette. Delegates to the shared `openCommandPalette()`
 * helper (which re-dispatches the global ⌘K hotkey) so the open path is
 * identical to the G4 bottom-left affordance.
 *
 * Detects platform and shows ⌘K vs Ctrl+K accordingly.
 */
export function OpenCommandPaletteButton({
  label = "Open command palette",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const isMac =
    typeof navigator !== "undefined" &&
    /mac|iphone|ipad|ipod/i.test(navigator.platform);
  const hint = isMac ? "⌘K" : "Ctrl+K";

  return (
    <Button
      variant="secondary"
      size="lg"
      className={className}
      onClick={openCommandPalette}
      trailingIcon={
        <kbd
          className="ml-1 inline-flex items-center rounded border border-border-strong/70 bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] tracking-tight text-text-muted"
          aria-hidden="true"
        >
          {hint}
        </kbd>
      }
    >
      {label}
    </Button>
  );
}
