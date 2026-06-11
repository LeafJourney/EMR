"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useChartFrame, type ChartTabPosition } from "./chart-frame";

// EMR-119/124: tabs are tagged with a `group` so the rail can cluster
// related sections instead of presenting all 9 as one undifferentiated
// row. Groups follow Dr. Patel's proposal — Overview / Clinical /
// Documents / Financial. Deep links (`?tab=key`) are unchanged so
// existing bookmarks and peek hrefs keep working.
const TABS = [
  { key: "demographics", label: "Demographics", dot: "bg-[color:var(--info)]", group: "Overview" },
  { key: "memory", label: "Memory", dot: "bg-accent", group: "Overview" },
  // Unified chronological feed of every meaningful chart event
  // (visits, messages, notes, labs, refills, tasks). Filterable and
  // grouped by day — Linear/Notion style activity rail. Lives in
  // Overview because it answers "what happened recently?" the same
  // way Memory answers "what do we know?".
  { key: "timeline", label: "Timeline", dot: "bg-[color:var(--info)]", group: "Overview" },
  { key: "notes", label: "Notes", dot: "bg-[color:var(--highlight)]", group: "Clinical" },
  // EMR-894 — Private clinician-only notes moved off their own rail tab
  // onto a "Private" label on the Patient Chart card (see
  // private-notes-button.tsx). The key stays valid (counts + deep links)
  // but is flagged `hidden` so it no longer renders as a rail tab.
  { key: "private_notes", label: "Private notes", dot: "bg-danger", group: "Clinical", hidden: true },
  { key: "labs", label: "Labs, Scores & Vitals", dot: "bg-[color:var(--success)]", group: "Clinical" },
  { key: "images", label: "Images", dot: "bg-[color:var(--info)]", group: "Clinical" },
  { key: "rx", label: "Rx", dot: "bg-[color:var(--highlight)]", group: "Clinical" },
  { key: "records", label: "Records", dot: "bg-accent", group: "Documents" },
  { key: "correspondence", label: "Correspondence", dot: "bg-[color:var(--info)]", group: "Documents" },
  // EMR-178 — Billing tab is a deep-link to the standalone Financial
  // Cockpit page rather than a query-param panel inside the chart.
  // The cockpit is too rich (P&L, claim drilldowns, statements) to fit
  // inside the chart frame; sending physicians straight there avoids
  // the half-rendered summary view.
  {
    key: "billing",
    // EMR-178/816: Dr. Patel — "Change 'Financial Cockpit' to 'Billing'".
    label: "Billing",
    dot: "bg-[color:var(--success)]",
    group: "Financial",
    redirectTo: (patientId: string) => `/clinic/patients/${patientId}/billing`,
  },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

const TAB_BY_KEY = new Map<TabKey, (typeof TABS)[number]>(
  TABS.map((t) => [t.key, t])
);
const DEFAULT_ORDER: TabKey[] = TABS.map((t) => t.key);
const STORAGE_KEY = "chart-tabs:order:v1";

/**
 * Reconcile a stored order array against the canonical TABS list.
 * Drops stale keys (tab removed), appends any new keys (tab added) at
 * the end so the physician doesn't silently lose access to a section
 * just because their saved order predates the schema.
 */
function reconcileOrder(stored: unknown): TabKey[] {
  if (!Array.isArray(stored)) return DEFAULT_ORDER;
  const seen = new Set<TabKey>();
  const valid: TabKey[] = [];
  for (const k of stored) {
    if (typeof k === "string" && TAB_BY_KEY.has(k as TabKey) && !seen.has(k as TabKey)) {
      valid.push(k as TabKey);
      seen.add(k as TabKey);
    }
  }
  for (const k of DEFAULT_ORDER) {
    if (!seen.has(k)) valid.push(k);
  }
  return valid;
}

/** A single "last N entries" row inside a tab's hover-peek popover. */
export interface PeekEntry {
  id: string;
  /** Primary label — usually the item's title or filename. */
  title: string;
  /** Secondary line — relative date, status, tag, whatever reads well. */
  meta?: string;
  /** Where clicking the row deep-links to (typically a sub-route). */
  href: string;
}

/** Peek data per tab. Only tabs present here show a peek popover. */
export type TabPeeks = Partial<Record<TabKey, PeekEntry[]>>;

/** Where an anchored popover (peek or settings menu) opens out from. */
type PeekAnchor = "above" | "below" | "left" | "right";

interface ChartTabsProps {
  patientId: string;
  counts: Record<TabKey, number>;
  peeks?: TabPeeks;
  /** AI-generated 1-2 sentence summary per tab, rendered atop the peek popover. */
  peekSummaries?: Partial<Record<TabKey, string>>;
}

export function ChartTabs({ patientId, counts, peeks, peekSummaries }: ChartTabsProps) {
  const searchParams = useSearchParams();
  const active = (searchParams.get("tab") as TabKey) || "records";

  // Position + compact come from the ChartFrame wrapper so the tab bar
  // and the tab content share one source of truth about layout.
  const { position, setPosition, compact, setCompact } = useChartFrame();
  const onBottom = position === "bottom";
  const onLeft = position === "left";
  const onRight = position === "right";
  const isVertical = onLeft || onRight;
  // Hover-peek anchors out from the tab into the content area, never
  // toward the page edge — keeps popovers fully on-screen regardless
  // of which side the rail is docked to.
  const peekAnchor: PeekAnchor = onBottom
    ? "above"
    : onLeft
      ? "right"
      : onRight
        ? "left"
        : "below";

  // Tab order. Seeded with the canonical order so SSR output matches
  // the server render; hydrated from localStorage in an effect so the
  // personalized order takes effect on the first paint after mount.
  const [order, setOrder] = React.useState<TabKey[]>(DEFAULT_ORDER);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setOrder(reconcileOrder(JSON.parse(raw)));
    } catch {
      // Corrupt JSON or blocked storage — silently fall back to the default.
    }
    setHydrated(true);
  }, []);

  const persistOrder = React.useCallback((next: TabKey[]) => {
    setOrder(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Safari private mode or quota exhausted — order stays in memory only.
    }
  }, []);

  const resetOrder = React.useCallback(() => {
    setOrder(DEFAULT_ORDER);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Drag state — source tab plus which tab + edge the cursor is over,
  // so the insertion indicator can render on the right side of the
  // drop target. Without the "side" bit we can only insert *before*
  // the hovered tab, making the end-of-list slot unreachable in a
  // single drag (Codex review on PR #18, P2).
  const [draggingKey, setDraggingKey] = React.useState<TabKey | null>(null);
  const [dragOverKey, setDragOverKey] = React.useState<TabKey | null>(null);
  const [dropSide, setDropSide] = React.useState<"before" | "after">("before");

  // Hover-peek state. At most one open at a time.
  const [openKey, setOpenKey] = React.useState<TabKey | null>(null);
  // A small close delay keeps the popover open while the cursor slides
  // from the tab onto the popover itself.
  const closeTimer = React.useRef<number | null>(null);

  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenKey(null), 120);
  };
  const cancelClose = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  React.useEffect(() => () => cancelClose(), []);

  const handleDragStart = (key: TabKey) => (e: React.DragEvent) => {
    setDraggingKey(key);
    setOpenKey(null); // peek would obscure the drop zones
    cancelClose();
    // Firefox requires dataTransfer to have data set for drag to initiate.
    e.dataTransfer.setData("text/plain", key);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (key: TabKey) => (e: React.DragEvent) => {
    if (!draggingKey) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Which half of the target the cursor is over decides whether we
    // insert before or after it. The relevant axis swaps with
    // orientation — Y midpoint when the bar is a vertical rail,
    // X midpoint when it's horizontal — so end-of-list stays
    // reachable in a single drag in any layout.
    const rect = e.currentTarget.getBoundingClientRect();
    const side: "before" | "after" = isVertical
      ? e.clientY < rect.top + rect.height / 2
        ? "before"
        : "after"
      : e.clientX < rect.left + rect.width / 2
        ? "before"
        : "after";
    if (dragOverKey !== key) setDragOverKey(key);
    if (dropSide !== side) setDropSide(side);
  };

  const handleDragLeave = (key: TabKey) => () => {
    if (dragOverKey === key) setDragOverKey(null);
  };

  const handleDrop = (targetKey: TabKey) => (e: React.DragEvent) => {
    e.preventDefault();
    const source = draggingKey;
    const side = dropSide;
    setDraggingKey(null);
    setDragOverKey(null);
    if (!source || source === targetKey) return;
    const without = order.filter((k) => k !== source);
    const targetIdx = without.indexOf(targetKey);
    if (targetIdx < 0) return;
    const insertAt = side === "before" ? targetIdx : targetIdx + 1;
    const next = [
      ...without.slice(0, insertAt),
      source,
      ...without.slice(insertAt),
    ];
    persistOrder(next);
  };

  const handleDragEnd = () => {
    setDraggingKey(null);
    setDragOverKey(null);
  };

  const isReordered =
    hydrated && order.some((k, i) => k !== DEFAULT_ORDER[i]);

  return (
    <nav
      className={cn(
        "relative gap-1 border-border",
        // Layout direction follows orientation. Horizontal bars wrap
        // (long lists overflow to a second row); vertical rails fill
        // the rail wrapper's height and pin the trailing controls to
        // the bottom via mt-auto on the trailing group.
        // EMR-177: horizontal bars never use overflow-x — always
        // wrap. The per-tab min-width below biases the wrap toward
        // a clean 2-row layout instead of one long crowded row.
        isVertical
          ? "flex flex-col items-stretch h-full"
          : "flex flex-wrap items-center overflow-visible",
        // Border + outer spacing sit against the chart content (not
        // the page edge) regardless of which side the bar is on.
        onBottom && "border-t mt-8",
        position === "top" && "border-b mb-8",
        onLeft && "border-r pr-2 mr-4",
        onRight && "border-l pl-2 ml-4"
      )}
      aria-label="Chart sections"
    >
      {order.map((key, idx) => {
        const tab = TAB_BY_KEY.get(key);
        if (!tab) return null;
        // EMR-894: hidden tabs (e.g. private_notes) keep a valid key for
        // counts/deep-links but never render in the rail.
        if ("hidden" in tab && tab.hidden) return null;
        const isActive = active === tab.key;
        const count = counts[tab.key];
        const entries = peeks?.[tab.key];
        const hasPeek = entries !== undefined;
        const isOpen = openKey === tab.key && !draggingKey;
        const isDragging = draggingKey === tab.key;
        const isDropTarget = dragOverKey === tab.key && draggingKey !== tab.key;
        // EMR-119/124: render a group divider whenever the previous
        // tab in the displayed order belongs to a different group.
        // Vertical rails get an uppercase section label; horizontal
        // bars get a thin hairline separator.
        const prevKey = idx > 0 ? order[idx - 1] : null;
        const prevGroup = prevKey ? TAB_BY_KEY.get(prevKey)?.group : null;
        const showGroupBreak = prevGroup !== undefined && prevGroup !== tab.group;
        const isFirstWithGroup = idx === 0;

        return (
          <React.Fragment key={`grp-${tab.key}`}>
            {isVertical && (isFirstWithGroup || showGroupBreak) && (
              <p
                className={cn(
                  "px-3 text-[10px] uppercase tracking-[0.14em] font-medium text-text-subtle/70",
                  isFirstWithGroup ? "pt-1 pb-1.5" : "pt-3 pb-1.5"
                )}
                aria-hidden="true"
              >
                {tab.group}
              </p>
            )}
            {!isVertical && showGroupBreak && (
              <span
                aria-hidden="true"
                className="self-stretch w-px bg-border/60 mx-1 my-1"
              />
            )}
          <div
            draggable
            onDragStart={handleDragStart(tab.key)}
            onDragOver={handleDragOver(tab.key)}
            onDragLeave={handleDragLeave(tab.key)}
            onDrop={handleDrop(tab.key)}
            onDragEnd={handleDragEnd}
            className={cn(
              "relative group/tab transition-opacity",
              // EMR-177: in horizontal mode tabs get a min width so a
              // typical chart viewport yields two clean rows of ~5+4
              // tabs that wrap on narrow screens — no swipe-only ribbon.
              !isVertical && !compact && "min-w-[160px]",
              isDragging && "opacity-40"
            )}
            onMouseEnter={() => {
              if (draggingKey) return;
              cancelClose();
              if (hasPeek) setOpenKey(tab.key);
            }}
            onMouseLeave={scheduleClose}
            onFocus={() => {
              cancelClose();
              if (hasPeek) setOpenKey(tab.key);
            }}
            onBlur={scheduleClose}
          >
            {isDropTarget && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute rounded-full bg-accent",
                  isVertical
                    ? cn(
                        "left-2 right-2 h-0.5",
                        dropSide === "before" ? "-top-0.5" : "-bottom-0.5"
                      )
                    : cn(
                        "top-2 bottom-2 w-0.5",
                        dropSide === "before" ? "-left-0.5" : "-right-0.5"
                      )
                )}
              />
            )}
            <Link
              href={
                "redirectTo" in tab && tab.redirectTo
                  ? tab.redirectTo(patientId)
                  : `/clinic/patients/${patientId}?tab=${tab.key}`
              }
              scroll={false}
              draggable={false}
              aria-haspopup={hasPeek ? "true" : undefined}
              aria-expanded={hasPeek ? isOpen : undefined}
              title={compact ? tab.label : undefined}
              className={cn(
                // EMR-816: regular pointer cursor on the tab itself (not the
                // grab-hand) — the ⋮⋮ handle on hover signals it's still
                // draggable, so reorder works without the whole ribbon
                // feeling like a drag surface.
                "relative flex items-center gap-2 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer",
                // Vertical rails fill the rail width and use a slightly
                // tighter vertical rhythm so all 9 tabs read as a list;
                // horizontal bars keep the original padding.
                isVertical
                  ? "w-full px-3 py-2 rounded-md"
                  : cn(
                      "pl-3 py-2.5",
                      compact ? "pr-3" : "pr-4",
                      onBottom ? "rounded-b-md" : "rounded-t-md"
                    ),
                isActive
                  ? "text-accent"
                  : "text-text-muted hover:text-text hover:bg-surface-muted"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "text-text-subtle/40 leading-none text-[10px] tracking-tighter select-none transition-opacity",
                  "opacity-0 group-hover/tab:opacity-100"
                )}
                title="Drag to reorder"
              >
                ⋮⋮
              </span>
              <span
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  isActive ? tab.dot : "bg-border-strong/50"
                )}
              />
              {!compact && (
                <span className={cn(isVertical && "flex-1 truncate")}>
                  {tab.label}
                </span>
              )}
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-medium rounded-full tabular-nums shrink-0",
                  isVertical && "ml-auto",
                  isActive
                    ? "bg-accent-soft text-accent"
                    : "bg-surface-muted text-text-subtle"
                )}
              >
                {count}
              </span>
              {isActive && (
                <span
                  className={cn(
                    "absolute bg-accent rounded-full",
                    isVertical
                      ? cn(
                          "top-2 bottom-2 w-0.5",
                          // Active bar sits on the inner edge — flush
                          // against the chart content, away from the
                          // page edge.
                          onLeft ? "right-0" : "left-0"
                        )
                      : cn("left-2 right-2 h-0.5", onBottom ? "top-0" : "bottom-0")
                  )}
                />
              )}
            </Link>

            {hasPeek && isOpen && (
              <TabPeekPopover
                label={tab.label}
                entries={entries}
                summary={peekSummaries?.[tab.key]}
                seeAllHref={`/clinic/patients/${patientId}?tab=${tab.key}`}
                onLeave={scheduleClose}
                onEnter={cancelClose}
                anchor={peekAnchor}
              />
            )}
          </div>
          </React.Fragment>
        );
      })}

      {/* Trailing controls — pinned to the end of the bar regardless
          of orientation. Horizontal bars push to the right via
          ml-auto; vertical rails push to the bottom via mt-auto so
          the gear stays out of the tab list. */}
      <div
        className={cn(
          "flex items-center gap-1",
          isVertical
            ? "mt-auto pt-2 flex-col items-stretch"
            : "ml-auto mr-1"
        )}
      >
        {isReordered && (
          <button
            type="button"
            onClick={resetOrder}
            className={cn(
              "text-[11px] text-text-subtle hover:text-accent transition-colors px-2 py-1",
              isVertical && "text-left"
            )}
            title="Restore the default tab order"
          >
            Reset order
          </button>
        )}
        <ChartTabsSettingsMenu
          position={position}
          setPosition={setPosition}
          compact={compact}
          setCompact={setCompact}
          anchor={peekAnchor}
        />
      </div>
    </nav>
  );
}

/**
 * Hover-peek popover. Anchored beside its tab — below for top bars,
 * above for bottom bars, right for left rails, left for right rails —
 * so the popover always opens into the chart content area, never
 * past the page edge. Stays open while the cursor is inside via the
 * onEnter/onLeave hooks (parent tab container handles timing).
 */
function TabPeekPopover({
  label,
  entries,
  summary,
  seeAllHref,
  onEnter,
  onLeave,
  anchor,
}: {
  label: string;
  entries: PeekEntry[];
  summary?: string;
  seeAllHref: string;
  onEnter: () => void;
  onLeave: () => void;
  anchor: PeekAnchor;
}) {
  return (
    <div
      role="menu"
      aria-label={`${label} recent`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={cn(
        "absolute z-30 w-80 max-w-[calc(100vw-2rem)]",
        "rounded-lg border border-border bg-surface shadow-lg",
        anchor === "above" && "bottom-full mb-1 left-0",
        anchor === "below" && "top-full mt-1 left-0",
        anchor === "right" && "left-full ml-1 top-0",
        anchor === "left" && "right-full mr-1 top-0"
      )}
    >
      <div className="px-4 pt-3 pb-2 border-b border-border/60">
        {summary && (
          <p className="text-[12px] italic text-text-muted leading-snug mb-1.5">
            {summary}
          </p>
        )}
        <p className="text-[10px] uppercase tracking-wider text-text-subtle font-medium">
          Recent · {label}
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="px-4 py-5 text-sm text-text-muted italic text-center">
          Nothing yet.
        </p>
      ) : (
        <ul className="py-1">
          {entries.slice(0, 5).map((e) => (
            <li key={e.id}>
              <Link
                href={e.href}
                role="menuitem"
                className="block px-4 py-2 text-sm hover:bg-surface-muted transition-colors"
              >
                <p className="font-medium text-text truncate">{e.title}</p>
                {e.meta && (
                  <p className="text-[11px] text-text-subtle mt-0.5 truncate">
                    {e.meta}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="px-4 py-2 border-t border-border/60">
        <Link
          href={seeAllHref}
          className="text-xs font-medium text-accent hover:text-accent/80 transition-colors"
        >
          See all in {label} →
        </Link>
      </div>
    </div>
  );
}


/**
 * Trailing settings menu on the tab bar. Two preferences — bar
 * position (top / bottom / left / right) and density (labels vs
 * dots only). Closes on outside-click and Escape. Anchors out of
 * the bar in the same direction as the hover-peek popovers so the
 * panel never collides with the chart content.
 */
function ChartTabsSettingsMenu({
  position,
  setPosition,
  compact,
  setCompact,
  anchor,
}: {
  position: ChartTabPosition;
  setPosition: (p: ChartTabPosition) => void;
  compact: boolean;
  setCompact: (c: boolean) => void;
  anchor: PeekAnchor;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Tab bar settings"
        title="Tab bar settings"
        className={cn(
          "flex items-center justify-center h-7 w-7 rounded-md text-text-subtle hover:text-text hover:bg-surface-muted transition-colors",
          open && "bg-surface-muted text-text"
        )}
      >
        <SettingsIcon />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Tab bar settings"
          className={cn(
            "absolute z-40 w-56",
            "rounded-lg border border-border bg-surface shadow-lg p-1",
            // Anchor in the same direction as hover-peek popovers so
            // the panel always opens into the chart content area.
            anchor === "above" && "bottom-full mb-1 right-0",
            anchor === "below" && "top-full mt-1 right-0",
            anchor === "right" && "left-full ml-1 bottom-0",
            anchor === "left" && "right-full mr-1 bottom-0"
          )}
        >
          <SettingsSection label="Position">
            <SettingsToggle
              active={position === "top"}
              onClick={() => setPosition("top")}
              label="Top"
            />
            <SettingsToggle
              active={position === "bottom"}
              onClick={() => setPosition("bottom")}
              label="Bottom"
            />
            <SettingsToggle
              active={position === "left"}
              onClick={() => setPosition("left")}
              label="Left"
            />
            <SettingsToggle
              active={position === "right"}
              onClick={() => setPosition("right")}
              label="Right"
            />
          </SettingsSection>
          <SettingsSection label="Density">
            <SettingsToggle
              active={!compact}
              onClick={() => setCompact(false)}
              label="Show labels"
            />
            <SettingsToggle
              active={compact}
              onClick={() => setCompact(true)}
              label="Dots only"
            />
          </SettingsSection>
        </div>
      )}
    </div>
  );
}

function SettingsSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-1 py-1">
      <p className="text-[10px] uppercase tracking-wider text-text-subtle font-medium px-2 pt-1 pb-1.5">
        {label}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function SettingsToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm text-left transition-colors",
        active
          ? "bg-accent-soft/60 text-accent"
          : "text-text-muted hover:bg-surface-muted hover:text-text"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full shrink-0",
          active ? "bg-accent" : "bg-border-strong/40"
        )}
      />
      {label}
    </button>
  );
}

function SettingsIcon() {
  // Inline SVG — keeps bundle free of an icon dep, matches the
  // text-subtle stroke weight of the rest of the bar chrome.
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
