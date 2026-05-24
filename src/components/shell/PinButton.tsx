"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Tooltip } from "@/components/ui/tooltip";
import { useNavPrefs } from "./NavPrefsContext";

/**
 * Small star toggle that any NavItem row can render. Filled = pinned,
 * outline = pinnable. Click toggles via the NavPrefsContext.
 *
 * The button suppresses link activation (stopPropagation + preventDefault)
 * so clicking the star inside a <Link> row only toggles the pin — it does
 * not navigate.
 */

export interface PinButtonProps {
  href: string;
  label: string;
  /** Optional visual density knob. `rail` = always visible, `hover` = opacity-on-hover. */
  visibility?: "rail" | "hover";
  className?: string;
}

export function PinButton({
  href,
  label,
  visibility = "hover",
  className,
}: PinButtonProps) {
  const prefs = useNavPrefs();
  if (!prefs) return null;

  const pinned = prefs.isPinned(href);

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (pinned) prefs.unpin(href);
    else prefs.pin({ href, label });
  };

  const tip = pinned ? `Unpin ${label}` : `Pin ${label}`;

  return (
    <Tooltip content={tip} side="right" delay={400}>
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pinned}
      aria-label={tip}
      className={cn(
        "inline-flex items-center justify-center h-6 w-6 rounded-md text-text-subtle",
        "transition-all duration-150 ease-smooth",
        "hover:bg-surface-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        visibility === "hover" && !pinned
          ? "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          : "opacity-100",
        pinned && "text-amber-500",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={pinned ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
    </Tooltip>
  );
}
