"use client";

// MASTER-prompt G4 — "a search icon at the bottom-left of every page = a
// full-directory query (search the whole 'computer', not just one 'folder')."
// This is the always-present visible affordance for the global ⌘K command
// palette, deliberately distinct from the page-specific G3 autocomplete.
// It opens the palette the operator shell already mounts.

import { Search } from "lucide-react";
import { openCommandPalette } from "@/components/ui/command-palette";
import { cn } from "@/lib/utils/cn";

export function GlobalSearchButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Search everything"
      title="Search everything (⌘K)"
      className={cn(
        // Fixed bottom-left, beneath the palette modal (z-50) but above page
        // chrome. Round icon target sized for comfortable clicking.
        "fixed bottom-4 left-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full",
        "border border-border-strong bg-surface text-text-muted shadow-lg shadow-black/10",
        "transition-colors hover:bg-surface-muted hover:text-text",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        // Hidden on small screens — the doc scopes this pass to desktop.
        "hidden md:inline-flex",
        className,
      )}
    >
      <Search className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
