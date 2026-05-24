"use client";

// "Print" CTA — opens the dedicated print route in a new window/tab so
// `window.print()` can fire against a clean canvas without disturbing the
// clinician's working chart.
//
// ux/print-stylesheets-clinical (unticketed UX run).
//
// Why a new window instead of `window.print()` on the chart itself:
//   - The chart UI is dense, has sidebars, chat docks, and the context drawer.
//     Even with a perfect `@media print` reset, the printer pulls from the
//     live DOM — half the time a stale modal or toast lands on paper.
//   - The dedicated `/print` route re-renders the data through PrintDocument,
//     so the printed copy is *always* the canonical clinical layout. No
//     surprises.
//
// The button is intentionally a small `<a>` so it's keyboard-accessible
// (Enter triggers it) and respects ctrl/cmd-click → "open in background tab".

import Link from "next/link";
import { Printer } from "lucide-react";

export interface PrintLinkButtonProps {
  /** Absolute path to the `/print` route to open. */
  href: string;
  /** Button label. Defaults to "Print". */
  label?: string;
  /** Visual variant — matches the surrounding chart toolbar style. */
  variant?: "ghost" | "secondary";
}

export function PrintLinkButton({
  href,
  label = "Print",
  variant = "ghost",
}: PrintLinkButtonProps) {
  const baseClasses =
    "inline-flex items-center gap-1.5 rounded-md font-medium h-8 px-3 text-sm transition-colors";
  const variantClasses =
    variant === "secondary"
      ? "bg-surface-muted text-text hover:bg-surface-muted/80 border border-border"
      : "text-text-muted hover:text-text hover:bg-surface-muted/60";

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener"
      // `data-print-hide` keeps the button from accidentally printing if a
      // clinician triggers Cmd-P on the parent page instead of clicking.
      data-print-hide=""
      className={`${baseClasses} ${variantClasses}`}
      aria-label={label}
    >
      <Printer size={14} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
