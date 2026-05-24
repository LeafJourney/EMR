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
// Popover — click-triggered, richer-content sibling of <Tooltip>.
//
// Use for menus, info panels, mini-forms — anything that wants to be a
// real floating surface rather than a hover hint.
//
// Features:
//   • Portal to <body>, auto-flip, same motion language as Tooltip
//   • Closes on click-outside or Esc
//   • Focus trap when content contains focusable elements
//   • Returns focus to trigger on close
//
// Usage:
//   <Popover content={<MenuList />} side="bottom">
//     <button>Actions</button>
//   </Popover>
//
//   Controlled:
//   <Popover open={open} onOpenChange={setOpen} content={<Form />}>
//     <Button>Open</Button>
//   </Popover>
// ---------------------------------------------------------------------------

const VIEWPORT_PAD = 8;
const ARROW_SIZE = 6;

const FOCUSABLE_SELECTOR =
  'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])';

type Coords = { top: number; left: number; side: TooltipSide };

export interface PopoverProps {
  content: ReactNode;
  side?: TooltipSide;
  /** Controlled open. Omit for uncontrolled. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /** Defer open after click — usually 0 (immediate). */
  delay?: number;
  className?: string;
  /** Single ReactElement child as the trigger. */
  children: ReactElement;
}

function computePosition(
  anchorRect: DOMRect,
  panelRect: { width: number; height: number },
  preferred: TooltipSide,
): Coords {
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;

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
    top = anchorRect.top + anchorRect.height / 2 - panelRect.height / 2;
    left = anchorRect.right + ARROW_SIZE;
  }

  left = Math.max(VIEWPORT_PAD, Math.min(left, vw - panelRect.width - VIEWPORT_PAD));
  top = Math.max(VIEWPORT_PAD, Math.min(top, vh - panelRect.height - VIEWPORT_PAD));
  return { top, left, side };
}

export function Popover({
  content,
  side = "bottom",
  open: controlledOpen,
  onOpenChange,
  delay = 0,
  className,
  children,
}: PopoverProps) {
  const id = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduce = useReducedMotion() ?? false;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Recompute position on open + scroll/resize.
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

  // Click-outside + Esc handling + focus trap + focus return.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;

    // Move focus into the panel on open (first focusable, else panel root).
    const focusInitial = () => {
      const node = panelRef.current;
      if (!node) return;
      const focusable = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const target = focusable[0] ?? node;
      target.focus();
    };
    // Defer to next frame so the panel is fully laid out.
    const raf = requestAnimationFrame(focusInitial);

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const node = panelRef.current;
      if (!node) return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
      // Restore focus to the trigger.
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === "function") {
        queueMicrotask(() => prev.focus());
      }
    };
  }, [open, setOpen]);

  useEffect(
    () => () => {
      if (openTimer.current) clearTimeout(openTimer.current);
    },
    [],
  );

  if (!isValidElement(children)) {
    return children;
  }

  type TriggerProps = {
    ref?: React.Ref<HTMLElement>;
    onClick?: (e: React.MouseEvent) => void;
    "aria-haspopup"?: boolean | "dialog" | "menu" | "true" | "listbox" | "tree" | "grid";
    "aria-expanded"?: boolean;
    "aria-controls"?: string;
  };
  const existing = (children as ReactElement<TriggerProps>).props;
  const cloned: TriggerProps & Record<string, unknown> = {
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node;
      const childRef = (children as unknown as { ref?: unknown }).ref;
      if (typeof childRef === "function") {
        (childRef as (n: HTMLElement | null) => void)(node);
      } else if (childRef && typeof childRef === "object" && "current" in childRef) {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onClick: (e: React.MouseEvent) => {
      existing.onClick?.(e);
      if (e.defaultPrevented) return;
      if (open) {
        setOpen(false);
        return;
      }
      if (delay > 0) {
        if (openTimer.current) clearTimeout(openTimer.current);
        openTimer.current = setTimeout(() => setOpen(true), delay);
      } else {
        setOpen(true);
      }
    },
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    "aria-controls": id,
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
                role="dialog"
                aria-modal="false"
                tabIndex={-1}
                style={panelStyle}
                {...motionProps}
              >
                <div
                  className={cn(
                    "min-w-[8rem] rounded-lg border border-border bg-surface-raised p-2 shadow-lg",
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
