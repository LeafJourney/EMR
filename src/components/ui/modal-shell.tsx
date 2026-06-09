"use client";

/**
 * EMR-642 — Canonical modal close pattern.
 *
 * Guarantees:
 *   • Visible X button, always in the top-right corner of the header.
 *   • Backdrop click and Escape key close immediately when the form is
 *     pristine; when isDirty=true they surface an inline "Discard changes?"
 *     confirmation bar instead.
 *   • Body scroll is locked while the modal is open.
 */

import * as React from "react";
import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small all-caps label above the title (e.g. "Refill request"). */
  eyebrow?: string;
  description?: string;
  /**
   * When true, closing via X / backdrop / Escape shows an inline
   * "Discard changes?" guard rather than immediately dismissing.
   */
  isDirty?: boolean;
  /** `"sheet"` (default) slides up from bottom on mobile, centers on sm+.
   *  `"center"` is always centred. */
  placement?: "sheet" | "center";
  maxWidth?: string;
  className?: string;
  /** Optional sticky footer rendered below the scrollable body. */
  footer?: React.ReactNode;
  /** Optional actions placed between the title block and the X button. */
  headerActions?: React.ReactNode;
  children?: React.ReactNode;
}

export function ModalShell({
  open,
  onClose,
  title,
  eyebrow,
  description,
  isDirty = false,
  placement = "sheet",
  maxWidth = "max-w-lg",
  className,
  footer,
  headerActions,
  children,
}: ModalShellProps) {
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);

  function requestClose() {
    if (isDirty) {
      setConfirming(true);
    } else {
      onClose();
    }
  }

  useEffect(() => {
    if (!open) {
      setConfirming(false);
      return;
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (isDirty) {
        setConfirming(true);
      } else {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isDirty, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center bg-black/40 backdrop-blur-sm",
        "animate-in fade-in duration-200",
        placement === "center"
          ? "items-center p-4"
          : "items-end sm:items-center sm:p-4",
      )}
      onClick={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className={cn(
          "w-full flex flex-col bg-bg border border-border shadow-2xl",
          "max-h-[90vh]",
          placement === "center"
            ? "rounded-2xl"
            : "rounded-t-2xl sm:rounded-2xl",
          "animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300",
          maxWidth,
          className,
        )}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border shrink-0">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-xs uppercase tracking-wider text-text-subtle font-medium mb-1">
                {eyebrow}
              </p>
            )}
            <h2
              id={titleId}
              className="font-display text-xl text-text leading-tight tracking-tight"
            >
              {title}
            </h2>
            {description && (
              <p className="text-sm text-text-muted mt-0.5">{description}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {headerActions}
            {/* Visible X close button — EMR-642 */}
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center",
                "bg-surface-muted hover:bg-surface-raised text-text-muted hover:text-text",
                "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
              )}
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* ── Discard confirmation bar — shown when isDirty + requestClose ─ */}
        {confirming && (
          <div className="flex items-center justify-between gap-3 px-6 py-3 bg-amber-50 border-b border-amber-200 shrink-0">
            <p className="text-sm font-medium text-amber-800">
              Discard unsaved changes?
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onClose();
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-700 text-white hover:bg-amber-800 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1">{children}</div>

        {/* ── Footer (optional, stays pinned below the scroll area) ─────── */}
        {footer && (
          <div className="shrink-0 border-t border-border bg-surface-muted/40">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
