"use client";

/**
 * Tabs — Linear/Radix-tier compound primitive.
 *
 * Why this exists:
 *   We had ~10+ bespoke tab implementations across the EMR (sign-off rail,
 *   super-admin console, AI config, practice drilldown, education hub).
 *   Each reinvented keyboard handling, aria wiring, and active-indicator
 *   styles. This unifies them with a small headless API that matches the
 *   Radix surface, but ships a polished animated underline (or pill) by
 *   default so adopters don't have to draw their own.
 *
 * Compound API:
 *   <Tabs value="x" onValueChange={setX} variant="underline" urlParam="tab">
 *     <TabList aria-label="Sections">
 *       <Trigger value="x">Label</Trigger>
 *       <Trigger value="y">Label</Trigger>
 *     </TabList>
 *     <Panel value="x">…</Panel>
 *     <Panel value="y" lazy>…</Panel>
 *   </Tabs>
 *
 * Keyboard model (matches WAI-ARIA "automatic activation" tabs pattern):
 *   - ←/→ moves the active tab (in horizontal orientation; ↑/↓ in vertical)
 *   - Home / End jump to the first / last enabled tab
 *   - Tab key moves focus *out* of the tablist (only the active trigger is
 *     in the tab order — others have tabIndex=-1)
 *
 * Indicator:
 *   The underline (or pill background) is a single positioned span that
 *   measures the active trigger and animates to its new position with
 *   framer-motion. Reduced-motion preference short-circuits the spring so
 *   the indicator snaps instead.
 *
 * URL sync:
 *   If `urlParam` is set, the active tab mirrors that search-param. Updates
 *   use `router.replace(..., { scroll: false })` so back/forward stays
 *   meaningful but selection doesn't add a new history entry per click.
 *
 * Lazy panels:
 *   `<Panel lazy>` only mounts its children the first time the panel becomes
 *   active, then keeps them mounted (hidden via `hidden`/`display`) so state
 *   isn't blown away on subsequent toggles. Standard panels render eagerly.
 *
 * Not in scope here:
 *   - Manual-activation mode (focus-without-select) — none of our existing
 *     surfaces use it; can be added later via an `activationMode` prop.
 *   - Animated panel cross-fades — out of scope; consumers can wrap.
 */

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// Types & context
// ---------------------------------------------------------------------------

export type TabsVariant = "underline" | "pill";
export type TabsOrientation = "horizontal" | "vertical";

type RegistryEntry = {
  value: string;
  el: HTMLButtonElement;
  disabled: boolean;
};

interface TabsContextValue {
  value: string;
  setValue: (next: string) => void;
  variant: TabsVariant;
  orientation: TabsOrientation;
  baseId: string;
  registerTrigger: (entry: RegistryEntry) => () => void;
  /** Stable ref list, kept in DOM order for ←/→/Home/End navigation. */
  triggerOrderRef: React.MutableRefObject<RegistryEntry[]>;
  /** Token that bumps every time the active trigger or layout might change,
   *  so the indicator re-measures. */
  layoutToken: number;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsCtx(component: string): TabsContextValue {
  const ctx = React.useContext(TabsContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside <Tabs>.`);
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface TabsProps {
  /** Controlled active value. */
  value?: string;
  /** Initial value when uncontrolled. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Indicator style. Default: "underline". */
  variant?: TabsVariant;
  /** Orientation. Default: "horizontal". */
  orientation?: TabsOrientation;
  /** Sync active value to this URL search param. */
  urlParam?: string;
  /** Optional id prefix; auto-generated otherwise. */
  id?: string;
  className?: string;
  children?: React.ReactNode;
}

export function Tabs({
  value: controlled,
  defaultValue,
  onValueChange,
  variant = "underline",
  orientation = "horizontal",
  urlParam,
  id,
  className,
  children,
}: TabsProps) {
  const router = useRouter();
  // searchParams / pathname are only consulted when urlParam is set, but
  // hook order must be stable — call them unconditionally and ignore the
  // result otherwise. Inside the app router both hooks are safe in client
  // components.
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const reactId = React.useId();
  const baseId = id ?? `tabs-${reactId.replace(/[:]/g, "")}`;

  // Resolve the initial value: explicit controlled > URL param > defaultValue.
  // If none match, the root renders without an active trigger until the
  // first child registers — which is fine; the indicator is hidden in that
  // state.
  const urlValue = urlParam ? searchParams?.get(urlParam) ?? null : null;

  const [uncontrolled, setUncontrolled] = React.useState<string>(
    () => controlled ?? urlValue ?? defaultValue ?? "",
  );
  const value = controlled ?? uncontrolled;

  // Keep uncontrolled state in sync with URL changes (back/forward). Skipped
  // in controlled mode — consumer owns it then.
  React.useEffect(() => {
    if (controlled !== undefined) return;
    if (!urlParam) return;
    if (urlValue !== null && urlValue !== uncontrolled) {
      setUncontrolled(urlValue);
    }
  }, [controlled, urlParam, urlValue, uncontrolled]);

  const setValue = React.useCallback(
    (next: string) => {
      if (next === value) return;
      if (controlled === undefined) setUncontrolled(next);
      onValueChange?.(next);
      if (urlParam && pathname) {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        params.set(urlParam, next);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
    },
    [controlled, onValueChange, urlParam, pathname, router, searchParams, value],
  );

  // Registry — every <Trigger> registers its DOM node and value here so
  // keyboard nav and the indicator have a stable, ordered list to work
  // against without needing to walk the DOM.
  const triggerOrderRef = React.useRef<RegistryEntry[]>([]);
  const [layoutToken, setLayoutToken] = React.useState(0);

  const registerTrigger = React.useCallback((entry: RegistryEntry) => {
    const list = triggerOrderRef.current;
    // Replace any existing entry for this value (handles fast refresh).
    const idx = list.findIndex((e) => e.value === entry.value);
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    // Sort by DOM order so ←/→ matches what users see.
    list.sort((a, b) => {
      if (a.el === b.el) return 0;
      const pos = a.el.compareDocumentPosition(b.el);
      // eslint-disable-next-line no-bitwise
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      // eslint-disable-next-line no-bitwise
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    setLayoutToken((t) => t + 1);

    return () => {
      const cur = triggerOrderRef.current;
      const i = cur.findIndex((e) => e.value === entry.value);
      if (i >= 0) cur.splice(i, 1);
      setLayoutToken((t) => t + 1);
    };
  }, []);

  const ctxValue = React.useMemo<TabsContextValue>(
    () => ({
      value,
      setValue,
      variant,
      orientation,
      baseId,
      registerTrigger,
      triggerOrderRef,
      layoutToken,
    }),
    [value, setValue, variant, orientation, baseId, registerTrigger, layoutToken],
  );

  return (
    <TabsContext.Provider value={ctxValue}>
      <div
        className={cn(
          orientation === "vertical" ? "flex gap-6" : "flex flex-col",
          className,
        )}
        data-orientation={orientation}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// TabList
// ---------------------------------------------------------------------------

export interface TabListProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  "aria-label"?: string;
  children?: React.ReactNode;
}

export const TabList = React.forwardRef<HTMLDivElement, TabListProps>(
  function TabList({ className, children, ...rest }, ref) {
    const ctx = useTabsCtx("TabList");
    const listRef = React.useRef<HTMLDivElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        listRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      },
      [ref],
    );

    return (
      <div
        ref={setRefs}
        role="tablist"
        aria-orientation={ctx.orientation}
        data-variant={ctx.variant}
        data-orientation={ctx.orientation}
        className={cn(
          "relative",
          ctx.orientation === "horizontal"
            ? "flex items-center gap-1"
            : "flex flex-col items-stretch gap-0.5 min-w-[180px]",
          // Underline rail sits on the bottom of horizontal lists / right
          // edge of vertical rails. The indicator floats above this.
          ctx.variant === "underline" &&
            (ctx.orientation === "horizontal"
              ? "border-b border-border"
              : "border-r border-border pr-1"),
          className,
        )}
        {...rest}
      >
        {children}
        <TabIndicator listRef={listRef} />
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// Indicator (animated)
// ---------------------------------------------------------------------------

interface TabIndicatorProps {
  listRef: React.RefObject<HTMLDivElement>;
}

function TabIndicator({ listRef }: TabIndicatorProps) {
  const ctx = useTabsCtx("TabIndicator");
  const reduceMotion = useReducedMotion();
  const [rect, setRect] = React.useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const measure = React.useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const active = ctx.triggerOrderRef.current.find((e) => e.value === ctx.value);
    if (!active) {
      setRect(null);
      return;
    }
    const listBox = list.getBoundingClientRect();
    const elBox = active.el.getBoundingClientRect();
    setRect({
      left: elBox.left - listBox.left,
      top: elBox.top - listBox.top,
      width: elBox.width,
      height: elBox.height,
    });
  }, [ctx.triggerOrderRef, ctx.value, listRef]);

  // Re-measure when the active value changes, when registrations change
  // (layoutToken), and on resize. ResizeObserver covers font-load and
  // container-size shifts that don't fire `resize`.
  React.useLayoutEffect(() => {
    measure();
  }, [measure, ctx.value, ctx.layoutToken]);

  React.useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(() => measure());
    if (listRef.current) ro.observe(listRef.current);
    for (const entry of ctx.triggerOrderRef.current) {
      ro.observe(entry.el);
    }
    return () => ro.disconnect();
  }, [measure, ctx.layoutToken, ctx.triggerOrderRef, listRef]);

  if (!rect) return null;

  // Per-variant geometry. Underline = 2px line on the inner edge of the
  // rail. Pill = soft background that wraps the trigger.
  const isUnderline = ctx.variant === "underline";
  const isHorizontal = ctx.orientation === "horizontal";

  // Build the animate target as plain numbers — framer-motion accepts any
  // numeric layout prop here, but its inferred type for the `animate` prop
  // is so broad that mixing-in optional fields triggers "union too complex".
  // Spelling out a single shape keeps inference happy.
  const animate: { left?: number; top?: number; right?: number; bottom?: number; width: number; height: number } =
    isUnderline
      ? isHorizontal
        ? { left: rect.left, width: rect.width, bottom: -1, height: 2 }
        : { top: rect.top, height: rect.height, right: -1, width: 2 }
      : { left: rect.left, top: rect.top, width: rect.width, height: rect.height };

  return (
    <motion.span
      aria-hidden="true"
      data-tab-indicator
      initial={false}
      animate={animate}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 500, damping: 40, mass: 0.6 }
      }
      className={cn(
        "absolute pointer-events-none",
        isUnderline ? "bg-accent rounded-full" : "rounded-md bg-accent-soft",
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

export interface TriggerProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  value: string;
  disabled?: boolean;
}

export const Trigger = React.forwardRef<HTMLButtonElement, TriggerProps>(
  function Trigger({ value, disabled, className, onClick, onKeyDown, children, ...rest }, forwardedRef) {
    const ctx = useTabsCtx("Trigger");
    const localRef = React.useRef<HTMLButtonElement | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLButtonElement | null) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
      },
      [forwardedRef],
    );

    // Register / unregister with the root. We re-register whenever
    // disabled flips, so keyboard nav can skip disabled triggers.
    //
    // Depend on the stable registerTrigger callback — NOT the whole ctx.
    // Registration bumps layoutToken, which is part of ctx; with ctx in the
    // deps every registration invalidated the context and re-ran every
    // trigger's effect, which re-registered and bumped the token again —
    // an unconditional update loop (React #185) that took down every Tabs
    // surface on the client.
    const { registerTrigger } = ctx;
    React.useEffect(() => {
      const el = localRef.current;
      if (!el) return;
      return registerTrigger({ value, el, disabled: !!disabled });
    }, [registerTrigger, value, disabled]);

    const isActive = ctx.value === value;
    const triggerId = `${ctx.baseId}-trigger-${value}`;
    const panelId = `${ctx.baseId}-panel-${value}`;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;
      const list = ctx.triggerOrderRef.current.filter((entry) => !entry.disabled);
      if (list.length === 0) return;
      const idx = list.findIndex((entry) => entry.value === ctx.value);
      const last = list.length - 1;
      let nextIdx = idx;

      const isHorizontal = ctx.orientation === "horizontal";
      const prevKey = isHorizontal ? "ArrowLeft" : "ArrowUp";
      const nextKey = isHorizontal ? "ArrowRight" : "ArrowDown";

      switch (e.key) {
        case nextKey:
          nextIdx = idx < 0 ? 0 : (idx + 1) % list.length;
          break;
        case prevKey:
          nextIdx = idx <= 0 ? last : idx - 1;
          break;
        case "Home":
          nextIdx = 0;
          break;
        case "End":
          nextIdx = last;
          break;
        default:
          return;
      }
      e.preventDefault();
      const target = list[nextIdx];
      if (!target) return;
      ctx.setValue(target.value);
      // Roving-tabindex: move focus to the newly active trigger so the
      // user can keep pressing arrow keys without intermediate Tabs.
      requestAnimationFrame(() => target.el.focus());
    };

    return (
      <button
        ref={setRefs}
        type="button"
        role="tab"
        id={triggerId}
        aria-selected={isActive}
        aria-controls={panelId}
        tabIndex={isActive ? 0 : -1}
        disabled={disabled}
        data-state={isActive ? "active" : "inactive"}
        onClick={(e) => {
          onClick?.(e);
          if (e.defaultPrevented) return;
          if (!disabled) ctx.setValue(value);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium",
          "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-md",
          ctx.variant === "underline"
            ? ctx.orientation === "horizontal"
              ? "px-4 py-2.5"
              : "px-3 py-2 justify-start text-left"
            : "px-3 py-1.5",
          isActive
            ? ctx.variant === "underline"
              ? "text-accent"
              : "text-accent"
            : "text-text-muted hover:text-text",
          disabled && "opacity-50 pointer-events-none",
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  /**
   * If true, panel children are not rendered until the panel first becomes
   * active. After first mount they stay mounted (hidden when inactive) so
   * input state / scroll position survive tab toggles.
   */
  lazy?: boolean;
  /**
   * If true, the panel unmounts whenever it isn't active. Mutually
   * exclusive with `lazy` — `lazy` wins if both are set. Use sparingly:
   * this blows away input state.
   */
  forceMount?: boolean;
}

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  function Panel({ value, lazy, forceMount, className, children, ...rest }, ref) {
    const ctx = useTabsCtx("Panel");
    const isActive = ctx.value === value;
    const [hasBeenActive, setHasBeenActive] = React.useState(isActive);

    React.useEffect(() => {
      if (isActive && !hasBeenActive) setHasBeenActive(true);
    }, [isActive, hasBeenActive]);

    const triggerId = `${ctx.baseId}-trigger-${value}`;
    const panelId = `${ctx.baseId}-panel-${value}`;

    // Visibility / mounting strategy.
    // Default: always mount, toggle `hidden`. `lazy` defers first mount
    // until the panel becomes active. `forceMount` keeps the panel
    // mounted even when other panels in the same Tabs root use lazy
    // mounting — it has no effect today, but the prop is here so
    // consumers can opt in once we add an opposite "unmountWhenHidden"
    // mode (out of scope for this PR).
    void forceMount;
    const shouldRenderChildren = lazy ? hasBeenActive : true;

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={panelId}
        aria-labelledby={triggerId}
        hidden={!isActive}
        tabIndex={0}
        data-state={isActive ? "active" : "inactive"}
        className={cn(
          // A small top padding only matters in horizontal underline mode;
          // consumers control their own panel padding via className.
          "focus:outline-none",
          className,
        )}
        {...rest}
      >
        {shouldRenderChildren ? children : null}
      </div>
    );
  },
);

// All exports above. Consumers import { Tabs, TabList, Trigger, Panel }.
