"use client";

import { Button } from "@/components/ui/button";

/**
 * Tiny client-side CTA used inside error / not-found screens to surface
 * the global command palette. Synthesises a ⌘K KeyboardEvent so we don't
 * have to plumb a context through every error boundary — the palette
 * already listens for that hotkey globally.
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
      onClick={() => {
        // Re-use the palette's own hotkey handler instead of reaching into
        // its internals. Works in every route group, including ones where
        // the palette mounts conditionally.
        const evt = new KeyboardEvent("keydown", {
          key: "k",
          code: "KeyK",
          metaKey: isMac,
          ctrlKey: !isMac,
          bubbles: true,
        });
        window.dispatchEvent(evt);
      }}
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
