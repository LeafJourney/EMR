"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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
// HoverCard — GitHub-style rich preview anchored to a trigger element.
//
// Hover (or focus) over a trigger and a rich card pops next to it after
// a configurable open delay. Move the pointer from the trigger into the
// card itself and it stays open; leave both surfaces and it closes after
// a short grace window. Click is never required.
//
// Design choices that diverge from <Popover>:
//   - Hover/focus driven (not click), with open/close delays.
//   - Keeps open while pointer is over the *card* (so links inside are usable).
//   - Esc closes; clicking the trigger does nothing special.
//   - Apple-iOS aesthetic — soft 12px radius, hairline border, layered shadow.
//
// Reduced-motion: collapses open/close transitions to instant via shared
// `tooltipPop(reduce, side)` preset — markup stays identical so SSR is stable.
//
// Portal: renders to `document.body` so we escape `overflow: hidden` ancestors.
//
// Usage:
//   <HoverCard content={<PatientPreview id="x" />}>
//     <Link href="/clinic/patients/x">Maya Reyes</Link>
//   </HoverCard>
// ---------------------------------------------------------------------------

const VIEWPORT_PAD = 8;
const POINTER_GAP = 8;
const DEFAULT_OPEN_DELAY = 500;
const DEFAULT_CLOSE_DELAY = 250;
const FOCUS_OPEN_DELAY = 800; // tab-focus opens slower than hover

type Coords = { top: number; left: number; side: TooltipSide };

export interface HoverCardProps {
  /** Rich preview rendered inside the floating surface. */
  content: ReactNode;
  /** Preferred side relative to the trigger; auto-flips if it won't fit. */
  side?: TooltipSide;
  /** ms to wait before opening on hover/focus. Default 500. */
  openDelay?: number;
  /** ms to wait before closing after pointer leaves trigger + card. Default 250. */
  closeDelay?: number;
  /** Extra className applied to the card surface. */
  className?: string;
  /** Single ReactElement child as the anchor. */
  children: ReactElement;
}

function computePosition(
  anchorRect: DOMRect,
  panelRect: { width: number; height: number },
  preferred: TooltipSide,
): Coords {
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;

  const fitsTop =
    anchorRect.top - panelRect.height - POINTER_GAP - VIEWPORT_PAD >= 0;
  const fitsBottom =
    anchorRect.bottom + panelRect.height + POINTER_GAP + VIEWPORT_PAD <= vh;
  const fitsLeft =
    anchorRect.left - panelRect.width - POINTER_GAP - VIEWPORT_PAD >= 0;
  const fitsRight =
    anchorRect.right + panelRect.width + POINTER_GAP + VIEWPORT_PAD <= vw;

  let side: TooltipSide = preferred;
  if (preferred === "top" && !fitsTop && fitsBottom) side = "bottom";
  else if (preferred === "bottom" && !fitsBottom && fitsTop) side = "top";
  else if (preferred === "left" && !fitsLeft && fitsRight) side = "right";
  else if (preferred === "right" && !fitsRight && fitsLeft) side = "left";

  let top = 0;
  let left = 0;
  if (side === "top") {
    top = anchorRect.top - panelRect.height - POINTER_GAP;
    left = anchorRect.left + anchorRect.width / 2 - panelRect.width / 2;
  } else if (side === "bottom") {
    top = anchorRect.bottom + POINTER_GAP;
    left = anchorRect.left + anchorRect.width / 2 - panelRect.width / 2;
  } else if (side === "left") {
    top = anchorRect.top + anchorRect.height / 2 - panelRect.height / 2;
    left = anchorRect.left - panelRect.width - POINTER_GAP;
  } else {
    top = anchorRect.top + anchorRect.height / 2 - panelRect.height / 2;
    left = anchorRect.right + POINTER_GAP;
  }

  left = Math.max(
    VIEWPORT_PAD,
    Math.min(left, vw - panelRect.width - VIEWPORT_PAD),
  );
  top = Math.max(
    VIEWPORT_PAD,
    Math.min(top, vh - panelRect.height - VIEWPORT_PAD),
  );
  return { top, left, side };
}

export function HoverCard({
  content,
  side = "bottom",
  openDelay = DEFAULT_OPEN_DELAY,
  closeDelay = DEFAULT_CLOSE_DELAY,
  className,
  children,
}: HoverCardProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  }, []);

  const scheduleOpen = useCallback(
    (delay: number) => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      if (open) return;
      if (openTimer.current) clearTimeout(openTimer.current);
      openTimer.current = setTimeout(() => setOpen(true), delay);
    },
    [open],
  );

  const scheduleClose = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), closeDelay);
  }, [closeDelay]);

  // Recompute position whenever the card opens or layout shifts.
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const update = () => {
      const ar = anchor.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      setCoords(
        computePosition(ar, { width: pr.width, height: pr.height }, side),
      );
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, side, content]);

  // Esc-to-close while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        clearTimers();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!isValidElement(children)) {
    return children;
  }

  type TriggerProps = {
    ref?: React.Ref<HTMLElement>;
    onPointerEnter?: (e: React.PointerEvent) => void;
    onPointerLeave?: (e: React.PointerEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
    "aria-describedby"?: string;
  };
  const existing = (children as ReactElement<TriggerProps>).props;
  const cloned: TriggerProps & Record<string, unknown> = {
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node;
      const childRef = (children as unknown as { ref?: unknown }).ref;
      if (typeof childRef === "function") {
        (childRef as (n: HTMLElement | null) => void)(node);
      } else if (
        childRef &&
        typeof childRef === "object" &&
        "current" in childRef
      ) {
        (
          childRef as React.MutableRefObject<HTMLElement | null>
        ).current = node;
      }
    },
    onPointerEnter: (e: React.PointerEvent) => {
      existing.onPointerEnter?.(e);
      // Touch devices don't have hover semantics — skip to avoid
      // surprise overlays on tap.
      if (e.pointerType === "touch") return;
      scheduleOpen(openDelay);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      existing.onPointerLeave?.(e);
      if (e.pointerType === "touch") return;
      scheduleClose();
    },
    onFocus: (e: React.FocusEvent) => {
      existing.onFocus?.(e);
      // Open on keyboard focus; mouse focus already opened via pointerenter.
      scheduleOpen(FOCUS_OPEN_DELAY);
    },
    onBlur: (e: React.FocusEvent) => {
      existing.onBlur?.(e);
      scheduleClose();
    },
    "aria-describedby": open ? id : undefined,
  };

  const trigger = cloneElement(children as ReactElement, cloned);
  const resolvedSide = coords?.side ?? side;
  const motionProps = tooltipPop(reduce, resolvedSide);

  const panelStyle: CSSProperties = coords
    ? { position: "fixed", top: coords.top, left: coords.left, zIndex: 1000 }
    : { position: "fixed", top: 0, left: 0, opacity: 0, zIndex: 1000 };

  return (
    <>
      {trigger}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                id={id}
                role="tooltip"
                style={panelStyle}
                onPointerEnter={() => {
                  // Pointer is now on the card itself — keep it open.
                  if (closeTimer.current) {
                    clearTimeout(closeTimer.current);
                    closeTimer.current = null;
                  }
                }}
                onPointerLeave={scheduleClose}
                {...motionProps}
              >
                <div
                  className={cn(
                    // Apple-iOS card primitive: soft radius, hairline
                    // border, layered shadow, surface-raised so it
                    // floats above the page background.
                    "min-w-[16rem] max-w-[20rem] rounded-xl border border-border/80 bg-surface-raised shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18),0_2px_6px_-2px_rgba(0,0,0,0.08)]",
                    "p-3",
                    "focus:outline-none",
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
