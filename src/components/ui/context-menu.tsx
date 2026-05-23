"use client";

// ContextMenu — Monday/Linear/Notion-tier right-click menus.
//
// Bringing pro-productivity discoverability to LeafJourney EMR list
// surfaces: smart-inbox threads, patient roster rows, audit log rows, the
// front-desk queue board, DataTable consumers. Right-click any row to get
// the most useful actions one motion away.
//
// Design goals:
//
//   - Pure-React primitive — no @radix-ui/react-context-menu (kept the
//     dep set lean per worktree brief). One <ContextMenu> wraps any
//     element and listens for `oncontextmenu` (right-click) + long-press
//     on touch.
//   - Items: { label, icon?, onSelect, disabled?, danger?, kbd?, divider?,
//     subItems? }. Sub-menus open to the right on hover/Enter (auto-flip
//     to the left if there isn't room).
//   - Keyboard nav: ↑/↓ navigate, → opens sub, ← / Esc closes, Enter
//     selects. First item auto-focused on open.
//   - Auto-position: flips into the viewport so the menu never clips.
//   - Apple-iOS aesthetic: backdrop-blur, subtle shadow, rounded-2xl,
//     hairline border. `prefers-reduced-motion` ⇒ fade only (no scale).
//   - Long-press (≥ 450ms) on touch devices opens the menu at the touch
//     point.
//   - First-time discoverability nudge: a small "right-click for more"
//     hint that fades in on hover and self-dismisses to localStorage on
//     the first right-click anywhere on the page.
//
// Public API:
//
//   <ContextMenu items={items}>{children}</ContextMenu>
//   const ctx = useContextMenu(items); <div {...ctx.triggerProps}>…</div>
//   <ContextMenuHint /> — optional discoverability tooltip
//
// Adoption: <DataTable contextMenuItems={(row) => […]} /> wraps every row.

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

// ----------------------------------------------------------------- types

export interface ContextMenuItem {
  /** Visible label. */
  label: string;
  /** Optional 16-px icon (inline SVG, lucide-react node, emoji span). */
  icon?: React.ReactNode;
  /** Action handler. Receives the close fn so handlers can wait on async
   *  work before tearing down (rare — most just close immediately). */
  onSelect?: (close: () => void) => void;
  /** Renders the item dim + non-interactive; arrow keys skip past it. */
  disabled?: boolean;
  /** Red destructive tint. Apple/Linear convention — last in a group. */
  danger?: boolean;
  /** Right-aligned keyboard shortcut hint (e.g. "⌘ K"). Cosmetic. */
  kbd?: string;
  /** Render a hairline divider in place of this item. All other fields
   *  ignored when `divider: true`. */
  divider?: true;
  /** Nested submenu items. Opens to the right on hover / Enter. */
  subItems?: ContextMenuItem[];
}

export type ContextMenuItems = ContextMenuItem[];

// --------------------------------------------------- reduced-motion hook

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduce;
}

// ----------------------------------------------------- discoverability

const HINT_DISMISSED_KEY = "lj.contextMenu.hintDismissed.v1";

/** Mark the discoverability hint as dismissed for this user. Called from
 *  the menu itself on first open so the very first right-click satisfies
 *  the "show until first use" contract. */
function dismissHint() {
  try {
    window.localStorage.setItem(HINT_DISMISSED_KEY, "1");
    window.dispatchEvent(new CustomEvent("lj-context-menu-hint-dismiss"));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/**
 * ContextMenuHint — opt-in tiny "right-click for more" badge that fades
 * in on first hover over the wrapped surface and self-dismisses the first
 * time any context menu is opened.
 *
 * Usage:
 *   <ContextMenuHint>
 *     <YourList />
 *   </ContextMenuHint>
 */
export function ContextMenuHint({
  children,
  className,
  label = "Right-click for more",
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  const [dismissed, setDismissed] = React.useState(true);
  const [hovered, setHovered] = React.useState(false);
  const reduce = usePrefersReducedMotion();

  React.useEffect(() => {
    try {
      setDismissed(
        window.localStorage.getItem(HINT_DISMISSED_KEY) === "1",
      );
    } catch {
      setDismissed(false);
    }
    function onDismiss() {
      setDismissed(true);
    }
    window.addEventListener("lj-context-menu-hint-dismiss", onDismiss);
    return () =>
      window.removeEventListener("lj-context-menu-hint-dismiss", onDismiss);
  }, []);

  if (dismissed) return <>{children}</>;

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      <span
        role="note"
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute right-3 top-3 z-10",
          "inline-flex items-center gap-1.5 rounded-full",
          "border border-border/60 bg-surface/95 backdrop-blur",
          "px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em]",
          "text-text-subtle shadow-sm",
          reduce ? "transition-opacity duration-150" : "transition-all duration-200",
          hovered
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-0.5",
        )}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3" y="2" width="10" height="12" rx="5" stroke="currentColor" strokeWidth="1.3" />
          <line x1="8" y1="2" x2="8" y2="7" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        {label}
      </span>
    </div>
  );
}

// --------------------------------------------- menu position / auto-flip

interface OpenState {
  x: number;
  y: number;
  /** Optional: open submenu cascade. */
  trail: number[];
}

function clampPosition(
  x: number,
  y: number,
  menuW: number,
  menuH: number,
): { left: number; top: number } {
  if (typeof window === "undefined") return { left: x, top: y };
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x;
  let top = y;
  if (left + menuW + pad > vw) left = Math.max(pad, vw - menuW - pad);
  if (top + menuH + pad > vh) top = Math.max(pad, vh - menuH - pad);
  return { left, top };
}

// ------------------------------------------------------------ MenuPanel

interface MenuPanelProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
  /** Submenu depth. Root = 0. */
  depth?: number;
  /** If this menu is a submenu opened from a parent item, anchor near it. */
  anchorRect?: DOMRect | null;
  /** Called when the parent should re-focus (closing a submenu). */
  onReturnFocus?: () => void;
}

function MenuPanel({
  items,
  x,
  y,
  onClose,
  depth = 0,
  anchorRect,
  onReturnFocus,
}: MenuPanelProps) {
  const reduce = usePrefersReducedMotion();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [pos, setPos] = React.useState({ left: x, top: y });
  const [activeIndex, setActiveIndex] = React.useState<number>(() => {
    // Auto-focus the first non-divider, non-disabled item.
    const i = items.findIndex((it) => !it.divider && !it.disabled);
    return i === -1 ? 0 : i;
  });
  const [openSub, setOpenSub] = React.useState<number | null>(null);
  const [entered, setEntered] = React.useState(false);

  // Measure + clamp to viewport on mount; flip submenus to the left of
  // anchor when there's no room on the right.
  React.useLayoutEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (depth > 0 && anchorRect) {
      let left = anchorRect.right + 2;
      if (left + rect.width + 8 > window.innerWidth) {
        left = Math.max(8, anchorRect.left - rect.width - 2);
      }
      const top = clampPosition(left, anchorRect.top, rect.width, rect.height).top;
      setPos({ left, top });
    } else {
      setPos(clampPosition(x, y, rect.width, rect.height));
    }
    // Trigger CSS transition into the entered state on the next frame.
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [x, y, depth, anchorRect]);

  // Focus the active item whenever it changes. Wrapping in rAF avoids
  // stealing focus from the dispatching click before the menu mounts.
  React.useEffect(() => {
    const el = itemRefs.current[activeIndex];
    if (el) el.focus({ preventScroll: true });
  }, [activeIndex]);

  function moveActive(delta: number) {
    setActiveIndex((curr) => {
      const n = items.length;
      let next = curr;
      for (let step = 0; step < n; step++) {
        next = (next + delta + n) % n;
        const it = items[next];
        if (!it.divider && !it.disabled) return next;
      }
      return curr;
    });
  }

  function activate(index: number) {
    const item = items[index];
    if (!item || item.divider || item.disabled) return;
    if (item.subItems && item.subItems.length > 0) {
      setOpenSub(index);
      return;
    }
    item.onSelect?.(onClose);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(items.findIndex((it) => !it.divider && !it.disabled));
    } else if (e.key === "End") {
      e.preventDefault();
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (!it.divider && !it.disabled) {
          setActiveIndex(i);
          break;
        }
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate(activeIndex);
    } else if (e.key === "ArrowRight") {
      const item = items[activeIndex];
      if (item?.subItems?.length) {
        e.preventDefault();
        setOpenSub(activeIndex);
      }
    } else if (e.key === "ArrowLeft" || e.key === "Escape") {
      e.preventDefault();
      if (depth > 0) {
        onReturnFocus?.();
      } else {
        onClose();
      }
    }
  }

  const subAnchorRect = React.useMemo<DOMRect | null>(() => {
    if (openSub == null) return null;
    const el = itemRefs.current[openSub];
    return el ? el.getBoundingClientRect() : null;
  }, [openSub]);

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-orientation="vertical"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      onMouseLeave={() => {
        // Only collapse hover-opened submenus when leaving; root stays
        // open until outside-click / Esc handles it.
        if (depth > 0) setActiveIndex((i) => i);
      }}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        zIndex: 9999 + depth,
      }}
      className={cn(
        "min-w-[14rem] max-w-[20rem]",
        "rounded-2xl border border-border/70",
        "bg-surface/95 backdrop-blur-xl",
        "shadow-[0_8px_28px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)]",
        "py-1.5",
        "outline-none",
        reduce
          ? "transition-opacity duration-100"
          : "transition-[opacity,transform] duration-150 ease-out",
        entered
          ? "opacity-100 scale-100"
          : reduce
            ? "opacity-0"
            : "opacity-0 scale-[0.97]",
        // Apple-iOS easing: subtle origin so the scale feels native.
        !reduce && "origin-top-left",
      )}
    >
      {items.map((item, i) => {
        if (item.divider) {
          return (
            <div
              key={`div-${i}`}
              role="separator"
              className="my-1 h-px bg-border/60 mx-2"
            />
          );
        }
        const active = i === activeIndex;
        const hasSub = !!item.subItems?.length;
        return (
          <button
            key={`${item.label}-${i}`}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            role={hasSub ? "menuitem" : "menuitem"}
            aria-haspopup={hasSub || undefined}
            aria-expanded={hasSub ? openSub === i : undefined}
            aria-disabled={item.disabled || undefined}
            disabled={item.disabled}
            onClick={() => activate(i)}
            onMouseEnter={() => {
              if (item.disabled) return;
              setActiveIndex(i);
              if (hasSub) setOpenSub(i);
              else setOpenSub(null);
            }}
            className={cn(
              "w-full text-left",
              "flex items-center gap-2.5",
              "px-3 py-2 text-[13px] leading-tight",
              "rounded-lg mx-1",
              "transition-colors duration-100",
              "focus:outline-none",
              item.disabled
                ? "text-text-subtle/50 cursor-not-allowed"
                : item.danger
                  ? active
                    ? "bg-red-500/10 text-red-600"
                    : "text-red-600 hover:bg-red-500/10"
                  : active
                    ? "bg-accent-soft/60 text-text"
                    : "text-text hover:bg-surface-muted/60",
            )}
          >
            {item.icon != null ? (
              <span
                className={cn(
                  "inline-flex h-4 w-4 items-center justify-center shrink-0",
                  item.danger ? "text-red-500" : "text-text-subtle",
                )}
                aria-hidden="true"
              >
                {item.icon}
              </span>
            ) : (
              <span className="inline-block h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="flex-1 truncate">{item.label}</span>
            {item.kbd && (
              <span
                className={cn(
                  "ml-2 inline-flex shrink-0 items-center gap-0.5",
                  "rounded border border-border/60 bg-surface-muted/60",
                  "px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  "text-text-subtle tabular-nums",
                )}
                aria-hidden="true"
              >
                {item.kbd}
              </span>
            )}
            {hasSub && (
              <span
                aria-hidden="true"
                className="ml-1 text-[10px] text-text-subtle/70"
              >
                ▸
              </span>
            )}
          </button>
        );
      })}

      {openSub != null && items[openSub]?.subItems && subAnchorRect && (
        <MenuPanel
          items={items[openSub]!.subItems!}
          x={subAnchorRect.right + 2}
          y={subAnchorRect.top}
          depth={depth + 1}
          anchorRect={subAnchorRect}
          onClose={onClose}
          onReturnFocus={() => {
            setOpenSub(null);
            const el = itemRefs.current[openSub];
            el?.focus({ preventScroll: true });
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------- useContextMenu hook

export interface UseContextMenuResult {
  /** Spread on the wrapped element — adds right-click + long-press wiring. */
  triggerProps: {
    onContextMenu: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onTouchMove: () => void;
  };
  /** Render this anywhere — it portals to <body> when open. */
  menu: React.ReactNode;
  /** Imperatively open at a specific coordinate (e.g. from a ⋯ button). */
  openAt: (x: number, y: number) => void;
  /** True while the menu is open. */
  isOpen: boolean;
  /** Imperatively close the menu. */
  close: () => void;
}

const LONG_PRESS_MS = 450;

/**
 * Headless hook for callers that need more control than the
 * `<ContextMenu>` wrapper offers (e.g. integrating into DataTable rows
 * where each row's items depend on the row data).
 */
export function useContextMenu(
  items: ContextMenuItem[] | (() => ContextMenuItem[]),
): UseContextMenuResult {
  const [open, setOpen] = React.useState<OpenState | null>(null);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = React.useRef(false);
  const touchOrigin = React.useRef<{ x: number; y: number } | null>(null);

  const resolvedItems = typeof items === "function" ? items() : items;
  // Only resolve at open time to keep `items()` closures live across rows.
  const itemsForRender = open ? (typeof items === "function" ? items() : items) : resolvedItems;

  const close = React.useCallback(() => setOpen(null), []);

  const openAt = React.useCallback((x: number, y: number) => {
    dismissHint();
    setOpen({ x, y, trail: [] });
  }, []);

  // Outside click / scroll dismisses. Scroll on the rare touch-on-iOS
  // case where the menu would otherwise drift — also close.
  React.useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      // The menu is portalled outside our DOM; identify by data attr.
      const t = e.target as HTMLElement | null;
      if (t && t.closest("[data-lj-context-menu]")) return;
      close();
    }
    function onScroll() {
      close();
    }
    function onResize() {
      close();
    }
    document.addEventListener("mousedown", onPointer, true);
    document.addEventListener("touchstart", onPointer, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onPointer, true);
      document.removeEventListener("touchstart", onPointer, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  const triggerProps = React.useMemo(
    () => ({
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openAt(e.clientX, e.clientY);
      },
      onTouchStart: (e: React.TouchEvent) => {
        const touch = e.touches[0];
        if (!touch) return;
        touchOrigin.current = { x: touch.clientX, y: touch.clientY };
        longPressFired.current = false;
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
        longPressTimer.current = setTimeout(() => {
          longPressFired.current = true;
          if (touchOrigin.current) {
            openAt(touchOrigin.current.x, touchOrigin.current.y);
            // Vibrate to confirm on supported devices — non-fatal.
            try {
              navigator.vibrate?.(10);
            } catch {
              /* ignore */
            }
          }
        }, LONG_PRESS_MS);
      },
      onTouchEnd: () => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        touchOrigin.current = null;
      },
      onTouchMove: () => {
        // Any movement cancels the long-press intent.
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      },
    }),
    [openAt],
  );

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div data-lj-context-menu>
            <MenuPanel
              items={itemsForRender}
              x={open.x}
              y={open.y}
              onClose={close}
            />
          </div>,
          document.body,
        )
      : null;

  return { triggerProps, menu, openAt, isOpen: !!open, close };
}

// ---------------------------------------------- declarative wrapper

export interface ContextMenuProps {
  items: ContextMenuItem[] | (() => ContextMenuItem[]);
  children: React.ReactElement;
  /** Optional: disable the menu (useful for loading / disabled rows). */
  disabled?: boolean;
}

/**
 * Wrap any element to give it a right-click menu. Clones the child to
 * attach trigger props so the wrapper introduces no extra DOM node.
 *
 *   <ContextMenu items={[{ label: "Open", onSelect: …}, …]}>
 *     <button onClick={open}>Row</button>
 *   </ContextMenu>
 */
export function ContextMenu({ items, children, disabled }: ContextMenuProps) {
  const { triggerProps, menu } = useContextMenu(items);
  if (disabled) return <>{children}</>;
  // Type assertion: we accept any element that takes event handlers. If
  // the child already has onContextMenu/onTouchStart we compose them.
  const child = children as React.ReactElement<{
    onContextMenu?: (e: React.MouseEvent) => void;
    onTouchStart?: (e: React.TouchEvent) => void;
    onTouchEnd?: () => void;
    onTouchMove?: () => void;
  }>;
  const merged = {
    onContextMenu: (e: React.MouseEvent) => {
      child.props.onContextMenu?.(e);
      if (!e.defaultPrevented) triggerProps.onContextMenu(e);
      else triggerProps.onContextMenu(e); // we explicitly want the menu
    },
    onTouchStart: (e: React.TouchEvent) => {
      child.props.onTouchStart?.(e);
      triggerProps.onTouchStart(e);
    },
    onTouchEnd: () => {
      child.props.onTouchEnd?.();
      triggerProps.onTouchEnd();
    },
    onTouchMove: () => {
      child.props.onTouchMove?.();
      triggerProps.onTouchMove();
    },
  };
  return (
    <>
      {React.cloneElement(child, merged)}
      {menu}
    </>
  );
}

// --------------------------------------------------- tiny icon helpers
// 16-px SVGs so the menu items align nicely without pulling in
// lucide-react at the call site. Callers may pass any node as `icon`.

export const ContextMenuIcons = {
  Open: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 3h6v1H4v8h8V7h1v6H3V3z" fill="currentColor" />
      <path d="M10 2h4v4h-1V3.7L8.7 8 8 7.3 12.3 3H10V2z" fill="currentColor" />
    </svg>
  ),
  Copy: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="4" y="4" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  Pin: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .013 2.371c-.125.612-.413 1.27-.978 1.834a.5.5 0 0 1-.707 0L5.95 11.756 1.854 15.85a.5.5 0 1 1-.708-.707L5.243 11.05 2.475 8.28a.5.5 0 0 1 0-.706c.565-.565 1.222-.853 1.834-.978a5.93 5.93 0 0 1 2.372.013l3.134-3.134a2.97 2.97 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z" />
    </svg>
  ),
  Archive: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 6v6.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.5 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  Check: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Message: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 3.5h11a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H6L3 14v-2H2.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
  Calendar: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 6h12M5 2v3M11 2v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  Filter: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h12l-4.5 5.5V13l-3 1V9.5L2 4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
  Link: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M9 5h2.5a2.5 2.5 0 0 1 0 5H9M7 11H4.5a2.5 2.5 0 0 1 0-5H7M6 8h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  User: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 13c.7-2.3 2.7-3.5 5-3.5s4.3 1.2 5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
};
