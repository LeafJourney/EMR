"use client";

import { useState, useTransition } from "react";
import {
  buildShareIntent,
  type ShareableMilestone,
} from "@/lib/portal/social-share";

interface ShareButtonProps {
  milestone: ShareableMilestone;
  /** Optional override label — defaults to "Share". */
  label?: string;
  /** Visual emphasis. */
  variant?: "primary" | "ghost";
}

/**
 * Single-button entry point for social sharing — EMR-075.
 *
 * Uses the native Web Share API on devices that support it (iOS Safari,
 * Android Chrome). Falls back to a popover with per-platform deep links and
 * a "copy to clipboard" action everywhere else.
 */
export function ShareButton({
  milestone,
  label = "Share",
  variant = "ghost",
}: ShareButtonProps) {
  const intent = buildShareIntent(milestone);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  async function handleClick() {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({
          title: milestone.title,
          text: intent.text,
          url: intent.url,
        });
        return;
      } catch (err) {
        // User dismissed the native sheet — fall through to manual options.
        if (
          err instanceof DOMException &&
          (err.name === "AbortError" || err.name === "NotAllowedError")
        ) {
          return;
        }
      }
    }
    setOpen((v) => !v);
  }

  async function copyLink() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    startTransition(async () => {
      try {
        await navigator.clipboard.writeText(`${intent.text}\n${intent.url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard denied — leave the user with the manual links.
      }
    });
  }

  const baseClasses =
    "inline-flex items-center justify-center gap-1.5 h-8 px-3.5 text-sm font-medium rounded-md transition-all";
  const variantClasses =
    variant === "primary"
      ? "bg-gradient-to-b from-accent to-accent-strong text-accent-ink shadow-seal hover:scale-[1.02]"
      : "text-text-muted border border-border hover:bg-surface-muted hover:text-text";

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={handleClick}
        className={`${baseClasses} ${variantClasses}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span aria-hidden="true">↗</span>
        {label}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-2 min-w-[200px] rounded-xl border border-border bg-surface shadow-lg p-2"
        >
          <button
            type="button"
            onClick={copyLink}
            className="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-surface-muted flex items-center gap-2"
          >
            <span aria-hidden="true">📋</span>
            {copied ? "Copied!" : "Copy link"}
          </button>
          <a
            href={intent.platforms.twitter}
            target="_blank"
            rel="noreferrer"
            className="block text-sm px-3 py-2 rounded-md hover:bg-surface-muted"
          >
            Share on X / Twitter
          </a>
          <a
            href={intent.platforms.facebook}
            target="_blank"
            rel="noreferrer"
            className="block text-sm px-3 py-2 rounded-md hover:bg-surface-muted"
          >
            Share on Facebook
          </a>
          <a
            href={intent.platforms.linkedin}
            target="_blank"
            rel="noreferrer"
            className="block text-sm px-3 py-2 rounded-md hover:bg-surface-muted"
          >
            Share on LinkedIn
          </a>
          <a
            href={intent.platforms.email}
            className="block text-sm px-3 py-2 rounded-md hover:bg-surface-muted"
          >
            Email
          </a>
          <a
            href={intent.platforms.sms}
            className="block text-sm px-3 py-2 rounded-md hover:bg-surface-muted"
          >
            Text message
          </a>
        </div>
      )}
    </div>
  );
}
