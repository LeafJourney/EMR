/**
 * Pure helpers for the grouped sidebar nav.
 */

import { aggregateBadge, type NavBadge } from "@/lib/domain/nav-badges";
import type { NavAgentActivity } from "@/lib/domain/nav-agent-activity";

export type { NavBadge } from "@/lib/domain/nav-badges";

export type CountTone = "highlight" | "danger" | "accent";

// Icon references on NavSection cross the server→client RSC boundary, so they
// MUST be serializable. We pass a string key here and resolve to a component
// inside the client icon registry (./icon-registry). Passing a function/
// component reference directly triggers "Functions cannot be passed directly
// to Client Components" at render time.
export type NavIconKey =
  | "home"
  | "pill"
  | "calendar"
  | "message"
  | "user"
  | "stethoscope"
  | "clipboard-check"
  | "book-open"
  | "settings"
  | "layout-grid"
  | "dollar"
  | "users"
  | "building"
  | "chart"
  | "server"
  | "heart"
  | "inbox";

export interface NavItem {
  label: string;
  href: string;
  icon?: unknown;
  count?: number;
  countTone?: CountTone;
  badge?: NavBadge | null;
  activity?: NavAgentActivity | null;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
  defaultCollapsed?: boolean;
  badge?: NavBadge | null;
  icon?: NavIconKey;
  pillar?: string;
}

export function pillarId(section: NavSection, idx: number): string {
  return section.pillar ?? section.label ?? `pillar-${idx}`;
}

export function hasPillarIcons(sections: NavSection[]): boolean {
  return sections.some((s) => s.icon !== undefined);
}

const TONE_SEVERITY: Record<CountTone, number> = {
  danger: 3,
  accent: 2,
  highlight: 1,
};

export interface AggregateBadge {
  count: number;
  tone: CountTone;
}

export function aggregateSectionBadge(section: NavSection): AggregateBadge | null {
  let total = 0;
  let tone: CountTone = "highlight";
  let toneSeverity = 0;
  for (const item of section.items) {
    const n = item.count ?? 0;
    if (n <= 0) continue;
    total += n;
    const itemTone = item.countTone ?? "highlight";
    const severity = TONE_SEVERITY[itemTone];
    if (severity > toneSeverity) {
      tone = itemTone;
      toneSeverity = severity;
    }
  }
  if (total <= 0) return null;
  return { count: total, tone };
}

export function getSectionBadge(section: NavSection): NavBadge | null {
  if (section.badge !== undefined) return section.badge;
  return aggregateBadge(section.items.map((i) => i.badge ?? null));
}

export function isNavSection(node: NavItem | NavSection): node is NavSection {
  return Array.isArray((node as NavSection).items);
}

export type NavNode = NavItem | NavSection;

export function sectionContainsPath(section: NavSection, pathname: string): boolean {
  for (const item of section.items) {
    if (itemMatchesPath(item.href, pathname)) return true;
  }
  return false;
}

export function itemMatchesPath(href: string, pathname: string): boolean {
  if (href === pathname) return true;
  const segments = href.split("/").filter(Boolean);
  if (segments.length <= 1) return false;
  return pathname.startsWith(href + "/");
}

export interface ResolveCollapseInput {
  sections: NavSection[];
  pathname: string;
  persisted: Record<string, boolean>;
}

export function resolveInitialCollapseState(
  input: ResolveCollapseInput,
): Record<string, boolean> {
  const { sections, pathname, persisted } = input;
  const out: Record<string, boolean> = {};
  for (const section of sections) {
    if (!section.label) continue;
    if (sectionContainsPath(section, pathname)) {
      out[section.label] = false;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(persisted, section.label)) {
      out[section.label] = persisted[section.label];
      continue;
    }
    out[section.label] = section.defaultCollapsed ?? false;
  }
  return out;
}

export function collapseStorageKey(label: string): string {
  return `nav:group:${label}:collapsed`;
}

export function readPersistedCollapseState(
  sections: NavSection[],
  getItem: (key: string) => string | null,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const section of sections) {
    if (!section.label) continue;
    const raw = getItem(collapseStorageKey(section.label));
    if (raw === "true") out[section.label] = true;
    else if (raw === "false") out[section.label] = false;
  }
  return out;
}

export function toggleCollapseState(
  state: Record<string, boolean>,
  label: string,
): Record<string, boolean> {
  return { ...state, [label]: !state[label] };
}

export function flattenSectionItems(sections: NavSection[]): NavItem[] {
  const out: NavItem[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      out.push(item);
    }
  }
  return out;
}
