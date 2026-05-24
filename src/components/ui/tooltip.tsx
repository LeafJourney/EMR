"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { tooltipPop, type TooltipSide } from "@/lib/ui/motion";

// ---------------------------------------------------------------------------
// Tooltip — Linear / Notion-tier hover/focus overlay primitive.
//
// One canonical implementation we adopt across EMR. Replaces:
//   • native `title=""` HTML attributes (no styling, no keyboard, no a11y)
//   • bespoke `:hover` divs with absolute positioning
//   • ad-hoc inline popovers
//
// Features:
//   • Portal to <body> so the overlay never gets clipped by overflow:hidden
//   • Auto-flip when near viewport edge
//   • Fade-in via shared motion preset (tooltipPop) — respects reduced motion
//   • Keyboard: appears on focus, dismisses on blur / Esc
//   • Touch: tap-and-hold (long press) shows tooltip
//   • Wires `aria-describedby` onto the trigger so screen readers narrate it
//
// Usage:
//   <Tooltip content="Pin this navigation item">
//     <button>★</button>
//   </Tooltip>
//
//   <Tooltip content={<span>Rich <b>content</b> ok</span>} side="bottom" delay={300}>
//     <Badge>New</Badge>
//   </Tooltip>
// ---------------------------------------------------------------------------

const VIEWPORT_PAD = 8;
const ARROW_SIZE = 6;
const LONG_PRESS_MS = 500;

type Coords = { top: number; left: number; side: TooltipSide };

export interface TooltipProps {
  /** Tooltip body. String or node. Falsy = render children only (no-op). */
  content: ReactNode;
  /** Preferred side. Auto-flips to opposite when not enough room. */
  side?: TooltipSide;
  /** Hover open delay, ms. Default 500 — matches Linear/Notion. */
  delay?: number;
  /** Hover close delay, ms. Default 80 — feels snappy without flicker. */
  closeDelay?: number;
  /** Optional className for the floating panel. */
  className?: string;
  /** Optional id override (defaults to a generated one). */
  id?: string;
  /** Single ReactElement child the tooltip anchors to. */
  children: ReactElement;
  /** Disable entirely (still renders children). */
  disabled?: boolean;
}

function computePosition(
  anchorRect: DOMRect,
  panelRect: { width: number; height: number },
  preferred: TooltipSide,
): Coords {
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;

  // Determine if preferred side fits; otherwise flip.
  const fitsTop = anchorRect.top - panelRect.height - ARROW_SIZE - VIEWPORT_PAD >= 0;
  const fitsBottom = anchorRect.bottom + panelRect.height + ARROW_SIZE + VIEWPORT_PAD <= vh;
  const fitsLeft = anchorRect.left - panelRect.width - ARROW_SIZE - VIEWPORT_PAD >= 0;
  const fitsRight = anchorRect.right + panelRect.width + ARROW_SIZE + VIEWPORT_PAD <= vw;

  let side: TooltipSide = preferred;
  if (preferred === "top" && !fitsTop && fitsBottom) side = "bottom";
  else if (preferred === "bottom" && !fitsBottom && fitsTop) side = "top";
  else if (preferred === "left" && !fitsLeft && fitsRight) side = "right";
  else if (preferred === "right" && !fitsRight && fitsLeft) side = "left";

  let top = 0;
  let left = 0;

  if (side === "top") {
    top = anchorRect.top - panelRect.height - ARROW_SIZE;
    left = anchorRect.left + anchorRect.width / 2 - panelRect.width / 2;
  } else if (side === "bottom") {
    top = anchorRect.bottom + ARROW_SIZE;
    left = anchorRect.left + anchorRect.width / 2 - panelRect.width / 2;
  } else if (side === "left") {
    top = anchorRect.top + anchorRect.height / 2 - panelRect.height / 2;
    left = anchorRect.left - panelRect.width - ARROW_SIZE;
  } else {
    // right
    top = anchorRect.top + anchorRect.height / 2 - panelRect.height / 2;
    left = anchorRect.right + ARROW_SIZE;
  }

  // Clamp horizontally / vertically so we never run off-screen.
  left = Math.max(VIEWPORT_PAD, Math.min(left, vw - panelRect.width - VIEWPORT_PAD));
  top = Math.max(VIEWPORT_PAD, Math.min(top, vh - panelRect.height - VIEWPORT_PAD));

  return { top, left, side };
}

export function Tooltip({
  content,
  side = "top",
  delay = 500,
  closeDelay = 80,
  className,
  id,
  children,
  disabled = false,
}: TooltipProps) {
  const generatedId = useId();
  const tipId = id ?? `tip-${generatedId}`;
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduce = useReducedMotion() ?? false;

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearTimers = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    if (disabled || !content) return;
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (openTimer.current) return;
    openTimer.current = setTimeout(() => {
      setOpen(true);
      openTimer.current = null;
    }, delay);
  }, [delay, disabled, content]);

  const scheduleClose = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) return;
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, closeDelay);
  }, [closeDelay]);

  // Recompute position on open + on scroll/resize while open.
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const update = () => {
      const ar = anchor.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      setCoords(computePosition(ar, { width: pr.width, height: pr.height }, side));
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, side, content]);

  // Esc closes immediately while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearTimers();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // Build the child clone with anchor ref + a11y wiring.
  const child = useMemo<ReactElement>(() => {
    if (!isValidElement(children)) return children;
    type AnchorProps = {
      ref?: React.Ref<HTMLElement>;
      onMouseEnter?: (e: React.MouseEvent) => void;
      onMouseLeave?: (e: React.MouseEvent) => void;
      onFocus?: (e: React.FocusEvent) => void;
      onBlur?: (e: React.FocusEvent) => void;
      onTouchStart?: (e: React.TouchEvent) => void;
      onTouchEnd?: (e: React.TouchEvent) => void;
      onTouchCancel?: (e: React.TouchEvent) => void;
      "aria-describedby"?: string;
    };
    const existing = (children as ReactElement<AnchorProps>).props;
    const cloned: AnchorProps & Record<string, unknown> = {
      ref: (node: HTMLElement | null) => {
        anchorRef.current = node;
        // Forward to the child's own ref if present.
        const childRef = (children as unknown as { ref?: unknown }).ref;
        if (typeof childRef === "function") {
          (childRef as (n: HTMLElement | null) => void)(node);
        } else if (childRef && typeof childRef === "object" && "current" in childRef) {
          (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
        }
      },
      onMouseEnter: (e: React.MouseEvent) => {
        existing.onMouseEnter?.(e);
        scheduleOpen();
      },
      onMouseLeave: (e: React.MouseEvent) => {
        existing.onMouseLeave?.(e);
        scheduleClose();
      },
      onFocus: (e: React.FocusEvent) => {
        existing.onFocus?.(e);
        // Focus shows immediately — no hover delay for keyboard users.
        if (disabled || !content) return;
        clearTimers();
        setOpen(true);
      },
      onBlur: (e: React.FocusEvent) => {
        existing.onBlur?.(e);
        clearTimers();
        setOpen(false);
      },
      onTouchStart: (e: React.TouchEvent) => {
        existing.onTouchStart?.(e);
        if (disabled || !content) return;
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
        longPressTimer.current = setTimeout(() => {
          setOpen(true);
          longPressTimer.current = null;
        }, LONG_PRESS_MS);
      },
      onTouchEnd: (e: React.TouchEvent) => {
        existing.onTouchEnd?.(e);
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      },
      onTouchCancel: (e: React.TouchEvent) => {
        existing.onTouchCancel?.(e);
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      },
      "aria-describedby": open && content
        ? [existing["aria-describedby"], tipId].filter(Boolean).join(" ")
        : existing["aria-describedby"],
    };
    return cloneElement(children as ReactElement, cloned);
  }, [children, scheduleOpen, scheduleClose, clearTimers, content, disabled, open, tipId]);

  // Bail-out: no content or disabled — render children unchanged.
  if (!content || disabled) {
    return children;
  }

  const resolvedSide = coords?.side ?? side;
  const motionProps = tooltipPop(reduce, resolvedSide);
  const panelStyle: CSSProperties = coords
    ? { position: "fixed", top: coords.top, left: coords.left, zIndex: 1000, pointerEvents: "none" }
    : {
        // First paint, before measurement — render hidden in top-left so we
        // can measure without flashing on-screen.
        position: "fixed",
        top: 0,
        left: 0,
        opacity: 0,
        zIndex: 1000,
        pointerEvents: "none",
      };

  return (
    <>
      {child}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                id={tipId}
                role="tooltip"
                style={panelStyle}
                onMouseEnter={() => {
                  // Keep open if pointer enters the panel (rare — tooltips are
                  // pointer-events:none — but harmless).
                  if (closeTimer.current) {
                    clearTimeout(closeTimer.current);
                    closeTimer.current = null;
                  }
                }}
                onMouseLeave={scheduleClose}
                {...motionProps}
              >
                <div
                  className={cn(
                    "max-w-xs rounded-md border border-border bg-surface-raised px-2.5 py-1.5",
                    "text-xs leading-snug text-text shadow-md",
                    className,
                  )}
                >
                  {content}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
