"use client";

/**
 * useNotifications — client-side notification center hook.
 *
 * v1 strategy (no schema, no new deps):
 *   - Accepts an optional `sources` payload computed server-side (unread
 *     message counts from smart inbox, pending tasks, recent agent runs).
 *     Callers that don't have a payload yet can omit it — the hook will
 *     still operate against any cached items in localStorage.
 *   - Synthesises `AppNotification`s by combining server-derived signals
 *     with locally persisted read/dismissed state (keyed per user).
 *   - Notifies subscribers via a tiny module-level event bus so the bell
 *     badge updates instantly when the panel marks something read.
 *
 * Follow-up (tracked in code review): promote to a server-side
 * `Notification` model when we need cross-device read state, push fanout,
 * or grouped digests. Until then this lives entirely on the client.
 */

import * as React from "react";

import type {
  AppNotification,
  NotificationKind,
  UseNotificationsResult,
} from "./types";

// ---------- localStorage helpers ---------------------------------------------

const STORAGE_PREFIX = "lj.notifications.v1";

interface PersistedState {
  read: Record<string, string>; // id -> ISO timestamp
  dismissed: Record<string, string>; // id -> ISO timestamp
}

function storageKey(userId: string | undefined): string {
  return `${STORAGE_PREFIX}.${userId ?? "anon"}`;
}

function loadState(userId: string | undefined): PersistedState {
  if (typeof window === "undefined") return { read: {}, dismissed: {} };
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return { read: {}, dismissed: {} };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      read: parsed.read ?? {},
      dismissed: parsed.dismissed ?? {},
    };
  } catch {
    return { read: {}, dismissed: {} };
  }
}

function saveState(userId: string | undefined, state: PersistedState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // ignore quota errors — read state is best-effort
  }
}

// ---------- module-level event bus -------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

// ---------- input shapes -----------------------------------------------------

export interface NotificationSources {
  /** From smart-inbox loader — preview rows for unread/urgent threads. */
  messages?: Array<{
    threadId: string;
    title: string;
    snippet?: string;
    href?: string;
    receivedAt: string; // ISO
    unread: boolean;
  }>;
  /** Pending tasks assigned to the current user. */
  tasks?: Array<{
    id: string;
    title: string;
    href?: string;
    dueAt?: string; // ISO
    createdAt: string; // ISO
  }>;
  /** Recent agent runs surfaced from nav-agent-activity or similar. */
  agentRuns?: Array<{
    id: string;
    agent: string;
    summary: string;
    href?: string;
    completedAt: string; // ISO
  }>;
  /** Ad-hoc system events (deploys, ToS updates, etc). */
  system?: Array<{
    id: string;
    title: string;
    body?: string;
    href?: string;
    createdAt: string; // ISO
  }>;
  /** Lab result review queue. */
  labs?: Array<{
    id: string;
    title: string;
    href?: string;
    createdAt: string; // ISO
  }>;
}

export interface UseNotificationsOptions {
  userId?: string;
  sources?: NotificationSources;
}

// ---------- synth ------------------------------------------------------------

function synth(
  sources: NotificationSources,
): Array<Omit<AppNotification, "unread" | "dismissedAt">> {
  const out: Array<Omit<AppNotification, "unread" | "dismissedAt">> = [];

  for (const m of sources.messages ?? []) {
    out.push({
      id: `msg:${m.threadId}`,
      kind: "message" as NotificationKind,
      title: m.title,
      body: m.snippet,
      href: m.href,
      createdAt: m.receivedAt,
    });
  }
  for (const t of sources.tasks ?? []) {
    out.push({
      id: `task:${t.id}`,
      kind: "task" as NotificationKind,
      title: t.title,
      body: t.dueAt ? `Due ${new Date(t.dueAt).toLocaleDateString()}` : undefined,
      href: t.href,
      createdAt: t.createdAt,
    });
  }
  for (const a of sources.agentRuns ?? []) {
    out.push({
      id: `agent:${a.id}`,
      kind: "agent" as NotificationKind,
      title: a.agent,
      body: a.summary,
      href: a.href,
      createdAt: a.completedAt,
    });
  }
  for (const l of sources.labs ?? []) {
    out.push({
      id: `lab:${l.id}`,
      kind: "lab" as NotificationKind,
      title: l.title,
      href: l.href,
      createdAt: l.createdAt,
    });
  }
  for (const s of sources.system ?? []) {
    out.push({
      id: `system:${s.id}`,
      kind: "system" as NotificationKind,
      title: s.title,
      body: s.body,
      href: s.href,
      createdAt: s.createdAt,
    });
  }

  // Newest first.
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

// ---------- hook -------------------------------------------------------------

export function useNotifications(
  options: UseNotificationsOptions = {},
): UseNotificationsResult {
  const { userId, sources } = options;

  const [state, setState] = React.useState<PersistedState>(() =>
    loadState(userId),
  );

  // Subscribe to global notification bus so badge + panel stay in sync if
  // multiple components share the hook.
  React.useEffect(() => {
    const listener = () => setState(loadState(userId));
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [userId]);

  // Reload state when the userId changes (login/logout/switch).
  React.useEffect(() => {
    setState(loadState(userId));
  }, [userId]);

  const persist = React.useCallback(
    (next: PersistedState) => {
      saveState(userId, next);
      setState(next);
      emit();
    },
    [userId],
  );

  const synthed = React.useMemo(() => synth(sources ?? {}), [sources]);

  const items = React.useMemo<AppNotification[]>(() => {
    return synthed
      .map((row) => ({
        ...row,
        unread: !state.read[row.id],
        dismissedAt: state.dismissed[row.id] ?? null,
      }))
      .filter((row) => !row.dismissedAt);
  }, [synthed, state]);

  const unreadCount = React.useMemo(
    () => items.reduce((n, i) => (i.unread ? n + 1 : n), 0),
    [items],
  );

  const markRead = React.useCallback(
    (id: string) => {
      if (state.read[id]) return;
      persist({
        ...state,
        read: { ...state.read, [id]: new Date().toISOString() },
      });
    },
    [state, persist],
  );

  const markAllRead = React.useCallback(() => {
    const now = new Date().toISOString();
    const next = { ...state.read };
    let changed = false;
    for (const row of synthed) {
      if (!next[row.id]) {
        next[row.id] = now;
        changed = true;
      }
    }
    if (!changed) return;
    persist({ ...state, read: next });
  }, [state, synthed, persist]);

  const dismiss = React.useCallback(
    (id: string) => {
      if (state.dismissed[id]) return;
      persist({
        ...state,
        dismissed: { ...state.dismissed, [id]: new Date().toISOString() },
        // dismissing also marks read
        read: { ...state.read, [id]: state.read[id] ?? new Date().toISOString() },
      });
    },
    [state, persist],
  );

  return { items, unreadCount, markRead, markAllRead, dismiss };
}
