"use client";

/**
 * Centralized keyboard hotkey registry for LeafJourney EMR.
 *
 * Two surfaces:
 *
 *   1. A static registry (`GLOBAL_SHORTCUTS`) the help modal renders so users
 *      can discover what's available. Anything we want surfaced to the user
 *      lives here.
 *
 *   2. A `useHotkey` hook for surfaces (e.g. inbox, roster) to register
 *      list-specific bindings like `j`/`k`/`Enter` without each having to
 *      re-implement target detection, modifier handling, and cleanup.
 *
 * Design notes:
 *   • Plain global `keydown` listener — no deps.
 *   • Skips when focus is in a text field (input/textarea/select/contentEditable).
 *   • Cmd+K / Ctrl+K is owned by `CommandPalette` (see
 *     src/components/ui/command-palette.tsx); we leave it alone here.
 *   • `?` / `/` / `g <x>` leader handling is owned by the global
 *     `KeyboardShortcuts` component (src/components/ui/keyboard-shortcuts.tsx).
 *   • This file is intentionally framework-light: a hook plus pure data.
 */

import { useEffect, useRef } from "react";

// ───────────────────────────────────────── Public types

export interface ShortcutDescriptor {
  /** Bucket for the help modal layout. */
  section: "Navigation" | "Lists" | "Actions" | "Global";
  /** Human-readable key combo, space-separated for two-key sequences (e.g. "g h"). */
  keys: string;
  /** Short human label. */
  label: string;
  /** Optional longer description for tooltips/help. */
  description?: string;
}

// ───────────────────────────────────────── Registry

/**
 * Global shortcuts that work anywhere in the authenticated app shell.
 * Mirrors what `KeyboardShortcuts` actually wires up.
 *
 * Adding a new global hotkey? Wire it in `keyboard-shortcuts.tsx` AND add a
 * row here so the cheat sheet stays accurate.
 */
export const GLOBAL_SHORTCUTS: ShortcutDescriptor[] = [
  // Navigation (two-key `g` leader, Linear-style)
  { section: "Navigation", keys: "g h", label: "Go home", description: "Open the clinic overview" },
  { section: "Navigation", keys: "g m", label: "Go to messages", description: "Open the clinical inbox" },
  { section: "Navigation", keys: "g p", label: "Go to patients", description: "Open the patient roster" },
  { section: "Navigation", keys: "g s", label: "Go to sign-off", description: "Open the unified sign-off queue" },
  { section: "Navigation", keys: "g a", label: "Go to approvals", description: "Open AI draft approvals" },
  { section: "Navigation", keys: "g b", label: "Go to morning brief", description: "Open today's agenda" },

  // Actions
  { section: "Actions", keys: "/", label: "Focus search", description: "Focus the primary search input on the current page" },
  { section: "Actions", keys: "?", label: "Show keyboard help", description: "Open this cheat sheet" },
  { section: "Actions", keys: "⌘ K", label: "Open command palette", description: "Jump to any route or action" },
  { section: "Actions", keys: "Esc", label: "Close modal", description: "Dismiss the current dialog or overlay" },

  // Lists (list-scoped, documented globally so users discover them)
  { section: "Lists", keys: "j", label: "Next item", description: "Move down in the active list" },
  { section: "Lists", keys: "k", label: "Previous item", description: "Move up in the active list" },
  { section: "Lists", keys: "↵", label: "Open item", description: "Open the highlighted row" },
];

/**
 * Mapping the global `g` leader uses to route the user. Kept here so the
 * registry, the implementation, and the help modal can't drift apart.
 */
export const G_LEADER_ROUTES: Record<string, string> = {
  h: "/clinic",
  m: "/clinic/messages",
  p: "/clinic/patients",
  s: "/clinic/sign-off",
  a: "/clinic/approvals",
  b: "/clinic/morning-brief",
  // legacy alias — `i` used to mean inbox before the rename to messages
  i: "/clinic/messages",
};

// ───────────────────────────────────────── Helpers

/** Returns true if the event target is a text input we should not intercept. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}

/** Focus (and select) the page's primary search input, if any. */
export function focusPageSearch(): boolean {
  if (typeof document === "undefined") return false;
  const search =
    document.querySelector<HTMLInputElement>("[data-page-search]") ??
    document.querySelector<HTMLInputElement>("input[type='search']");
  if (!search) return false;
  search.focus();
  try {
    search.select();
  } catch {
    // Some input types (e.g. number) don't support select(); ignore.
  }
  return true;
}

// ───────────────────────────────────────── useHotkey hook

export interface HotkeyOptions {
  /** Allow the hotkey to fire even when focus is in a text input. */
  allowInInput?: boolean;
  /** Set to false to temporarily disable without unmounting. Defaults to true. */
  enabled?: boolean;
  /** Prevent default on match. Defaults to true. */
  preventDefault?: boolean;
}

/**
 * Parse a combo string like "cmd+k", "shift+/", "j", or "Enter" into a
 * predicate. Modifier order is irrelevant; key matching is case-insensitive.
 * Special tokens: "cmd"/"meta", "ctrl", "alt"/"opt", "shift",
 * "esc"/"escape", "enter"/"return", "space", "up"/"down"/"left"/"right".
 */
function parseCombo(combo: string): (e: KeyboardEvent) => boolean {
  const tokens = combo
    .toLowerCase()
    .split("+")
    .map((t) => t.trim())
    .filter(Boolean);

  let needMeta = false;
  let needCtrl = false;
  let needAlt = false;
  let needShift = false;
  let key: string | null = null;

  for (const t of tokens) {
    if (t === "cmd" || t === "meta") needMeta = true;
    else if (t === "ctrl") needCtrl = true;
    else if (t === "alt" || t === "opt" || t === "option") needAlt = true;
    else if (t === "shift") needShift = true;
    else key = t;
  }

  // Aliases for the eventual `event.key` comparison.
  const ALIASES: Record<string, string> = {
    esc: "escape",
    enter: "enter",
    return: "enter",
    space: " ",
    up: "arrowup",
    down: "arrowdown",
    left: "arrowleft",
    right: "arrowright",
  };
  const wantKey = key ? (ALIASES[key] ?? key) : null;

  return (e: KeyboardEvent) => {
    if (needMeta && !e.metaKey) return false;
    if (needCtrl && !e.ctrlKey) return false;
    if (needAlt && !e.altKey) return false;
    if (needShift && !e.shiftKey) return false;
    // If the combo doesn't request a modifier, don't match a modified press —
    // that keeps `j` from firing while the user is mashing ⌘J for native browser actions.
    if (!needMeta && e.metaKey) return false;
    if (!needCtrl && e.ctrlKey) return false;
    if (!needAlt && e.altKey) return false;
    if (wantKey && e.key.toLowerCase() !== wantKey) return false;
    return true;
  };
}

/**
 * Register a keyboard hotkey for the lifetime of the calling component.
 *
 * @example
 *   useHotkey("j", () => moveDown(), { enabled: items.length > 0 });
 *   useHotkey("Enter", () => open(items[index]));
 *   useHotkey("shift+a", () => archiveAll());
 */
export function useHotkey(
  combo: string,
  handler: (e: KeyboardEvent) => void,
  opts: HotkeyOptions = {},
): void {
  const { allowInInput = false, enabled = true, preventDefault = true } = opts;

  // Stash the handler in a ref so consumers don't have to memoize it.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const matches = parseCombo(combo);

    const onKeyDown = (e: KeyboardEvent) => {
      if (!allowInInput && isTypingTarget(e.target)) return;
      if (!matches(e)) return;
      if (preventDefault) e.preventDefault();
      handlerRef.current(e);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [combo, enabled, allowInInput, preventDefault]);
}
