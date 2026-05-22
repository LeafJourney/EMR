"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import {
  aggregateSectionBadge,
  collapseStorageKey,
  getSectionBadge,
  readPersistedCollapseState,
  resolveInitialCollapseState,
  sectionContainsPath,
  type CountTone,
  type NavItem,
  type NavSection,
} from "./nav-sections";
import type { BadgeSeverity, NavBadge } from "@/lib/domain/nav-badges";
import { NavActivityDot } from "./NavActivityDot";

/**
 * Rail renderer for the 3-tier IA.
 *
 * Tier 1: sections with no label render their items flush.
 * Tier 2: labeled sections get a collapsible header with an aggregate badge.
 * Tier 3: search everything via the ⌘K CommandPalette (separate component).
 *
 * Collapse state is persisted per-group via localStorage
 * (`nav:group:<label>:collapsed`) and resolved with smart defaults:
 * the section containing the current pathname is always open on first
 * render, defeating both the default and the persisted state.
 */

function toneClass(tone: CountTone): string {
  if (tone === "danger")
    return "bg-danger/10 text-danger border-danger/30 animate-pulse";
  if (tone === "accent")
    return "bg-accent-soft text-accent border-accent/25";
  return "bg-highlight-soft text-[color:var(--highlight-hover)] border-highlight/30";
}

function CountBadge({ count, tone }: { count: number; tone: CountTone }) {
  return (
    <span
      className={cn(
        "text-[10px] font-semibold leading-none rounded-full border px-1.5 py-0.5 tabular-nums",
        toneClass(tone),
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Semantic badge presentation
// ─────────────────────────────────────────────────────────────────────────────
// `ok` severity renders nothing — the section is silent-green. The dot color
// signals severity at a glance; the label gives the punchline; `context`
// becomes a native title-attribute tooltip.

const SEVERITY_LEAF: Record<Exclude<BadgeSeverity, "ok">, string> = {
  critical: "🍂",
  warn: "🌱",
  info: "🌿",
};

const SEVERITY_TEXT_CLASS: Record<Exclude<BadgeSeverity, "ok">, string> = {
  critical: "text-red-700",
  warn: "text-amber-700",
  info: "text-text-muted",
};

export function SemanticBadge({ badge }: { badge: NavBadge }) {
  if (badge.severity === "ok") return null;
  const leaf = SEVERITY_LEAF[badge.severity];
  const text = SEVERITY_TEXT_CLASS[badge.severity];
  return (
    <span
      title={badge.context}
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium tabular-nums",
        text,
      )}
    >
      <span aria-hidden="true" className="text-[9px] leading-none">
        {leaf}
      </span>
      {badge.label}
    </span>
  );
}

/**
 * Render the right-side indicator on a nav row. Prefers semantic badge over
 * legacy count-based pill, returning null when nothing to show.
 */
export function NavItemBadge({ item }: { item: NavItem }) {
  if (item.badge) {
    if (item.badge.severity === "ok") return null;
    return <SemanticBadge badge={item.badge} />;
  }
  const count = item.count ?? 0;
  if (count <= 0) return null;
  const tone = item.countTone ?? "highlight";
  return <CountBadge count={count} tone={tone} />;
}

/**
 * Compose the aria-label for a nav row, surfacing badge context to screen
 * readers.
 */
export function navItemAriaLabel(item: NavItem): string {
  if (item.badge && item.badge.severity !== "ok") {
    const ctx = item.badge.context ? `, ${item.badge.context}` : "";
    return `${item.label}: ${item.badge.label}${ctx}`;
  }
  const count = item.count ?? 0;
  if (count > 0) return `${item.label} (${count} waiting)`;
  return item.label;
}

function ItemLink({
  item,
  onClick,
  isActive,
}: {
  item: NavItem;
  onClick?: () => void;
  isActive: boolean;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-label={navItemAriaLabel(item)}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors duration-200 ease-smooth",
        isActive
          ? "bg-surface-muted text-text"
          : "text-text-muted hover:bg-surface-muted hover:text-text",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1 w-1 rounded-full transition-colors",
          isActive ? "bg-accent" : "bg-border-strong group-hover:bg-accent",
        )}
      />
      <span className="flex-1">{item.label}</span>
      {item.activity && <NavActivityDot tone={item.activity.tone} />}
      <NavItemBadge item={item} />
    </Link>
  );
}

export interface NavSectionsProps {
  sections: NavSection[];
  /**
   * If provided, called whenever a nav link is activated. Used by the mobile
   * drawer to close itself on navigation.
   */
  onItemClick?: () => void;
  /**
   * Render style. "rail" = desktop sidebar, "drawer" = mobile accordion.
   * Drawer mode gives items larger touch targets and tighter group chrome.
   */
  variant?: "rail" | "drawer";
}

export function NavSections({ sections, onItemClick, variant = "rail" }: NavSectionsProps) {
  const pathname = usePathname() ?? "";
  // Initial render must match the server. The server can't know the user's
  // persisted state, so on the first client render we seed from pathname +
  // defaults only, then hydrate from localStorage in a post-mount effect.
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>(() =>
    resolveInitialCollapseState({ sections, pathname, persisted: {} }),
  );
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = readPersistedCollapseState(sections, (k) => {
      try {
        return window.localStorage.getItem(k);
      } catch {
        return null;
      }
    });
    const next = resolveInitialCollapseState({ sections, pathname, persisted });
    setCollapsed((prev) => {
      const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
      for (const k of keys) {
        if (prev[k] !== next[k]) return next;
      }
      return prev;
    });
    setHydrated(true);
    // We intentionally run this once per pathname change so that navigating
    // into a group auto-expands it.
  }, [pathname, sections]);

  const toggle = (label: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            collapseStorageKey(label),
            next[label] ? "true" : "false",
          );
        } catch {
          /* localStorage can throw in private mode — non-fatal. */
        }
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {sections.map((section, idx) => {
        const isLabeled = Boolean(section.label);
        const isFirstLabeled =
          isLabeled &&
          sections.findIndex((s) => Boolean(s.label)) === idx;

        if (!isLabeled) {
          return (
            <ul key={`flat-${idx}`} className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <ItemLink
                    item={item}
                    onClick={onItemClick}
                    isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                  />
                </li>
              ))}
            </ul>
          );
        }

        const label = section.label!;
        const isCollapsed = collapsed[label] ?? section.defaultCollapsed ?? false;
        // Prefer the semantic rollup (severity-ranked across child `badge`
        // fields) when any item in the section carries a semantic badge.
        // Fall back to the legacy count aggregate otherwise.
        const semanticBadge = getSectionBadge(section);
        const countBadge = semanticBadge ? null : aggregateSectionBadge(section);
        const headerId = `nav-group-${label.toLowerCase().replace(/\s+/g, "-")}`;
        const panelId = `${headerId}-panel`;
        const activeWithin = sectionContainsPath(section, pathname);

        return (
          <div
            key={label}
            className={cn(
              isFirstLabeled ? "pt-1" : "pt-3 border-t border-border/40",
            )}
          >
            <button
              type="button"
              id={headerId}
              aria-expanded={!isCollapsed}
              aria-controls={panelId}
              onClick={() => toggle(label)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md transition-colors duration-200 ease-smooth",
                "hover:bg-surface-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                activeWithin && "text-text",
              )}
            >
              <span
                className={cn(
                  "flex-1 text-left text-[11px] font-semibold uppercase tracking-[0.14em]",
                  activeWithin ? "text-text" : "text-text-subtle",
                )}
              >
                {label}
              </span>
              {semanticBadge && semanticBadge.severity !== "ok" && (
                <SemanticBadge badge={semanticBadge} />
              )}
              {countBadge && (
                <CountBadge count={countBadge.count} tone={countBadge.tone} />
              )}
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                  "text-text-subtle transition-transform duration-200 ease-smooth",
                  isCollapsed ? "rotate-0" : "rotate-180",
                )}
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={headerId}
              hidden={isCollapsed}
              className={cn(
                "overflow-hidden transition-all duration-200 ease-smooth",
                isCollapsed ? "opacity-0 max-h-0" : "opacity-100",
                // While not hydrated we still want the panel to be visible if
                // not collapsed; this class guards against initial flash.
                hydrated ? "" : "",
              )}
            >
              <ul
                className={cn(
                  "space-y-0.5",
                  variant === "drawer" ? "mt-1 pl-1" : "mt-0.5 pl-1",
                )}
              >
                {section.items.map((item) => (
                  <li key={item.href}>
                    <ItemLink
                      item={item}
                      onClick={onItemClick}
                      isActive={
                        pathname === item.href || pathname.startsWith(item.href + "/")
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}
