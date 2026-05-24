"use client";

/**
 * Notification Center
 *
 * Linear/Notion-style persistent activity panel. Anchored top-right, opens
 * from a bell icon in the app shell. Distinct from the toast system
 * (PR #458) — toasts are transient feedback for the action you just took,
 * the notification center is the durable activity log.
 *
 * Style: Apple-iOS aesthetic — subtle dot for unread, soft glass panel,
 * tight typography. The badge animates a single bounce when the count goes
 * up so the user catches the change without us shouting in red.
 */

import * as React from "react";
import { Bell, X, Beaker, MessageSquare, CheckSquare, Sparkles, Info } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { AppNotification, NotificationKind } from "@/lib/notifications/types";
import {
  useNotifications,
  type NotificationSources,
} from "@/lib/notifications/useNotifications";

// ---------- helpers ----------------------------------------------------------

const KIND_ICON: Record<NotificationKind, React.ComponentType<{ className?: string }>> = {
  message: MessageSquare,
  lab: Beaker,
  task: CheckSquare,
  system: Info,
  agent: Sparkles,
};

const KIND_TINT: Record<NotificationKind, string> = {
  message: "text-blue-600 dark:text-blue-400",
  lab: "text-purple-600 dark:text-purple-400",
  task: "text-amber-600 dark:text-amber-400",
  system: "text-text-subtle",
  agent: "text-emerald-600 dark:text-emerald-400",
};

function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w`;
  return new Date(iso).toLocaleDateString();
}

// ---------- component --------------------------------------------------------

export interface NotificationCenterProps {
  userId?: string;
  sources?: NotificationSources;
  /** Visual treatment for the bell trigger. */
  variant?: "rail" | "header";
  /** Optional className passthrough on the trigger wrapper. */
  className?: string;
}

export function NotificationCenter({
  userId,
  sources,
  variant = "rail",
  className,
}: NotificationCenterProps) {
  const { items, unreadCount, markRead, markAllRead, dismiss } = useNotifications({
    userId,
    sources,
  });

  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"unread" | "all">("unread");
  const [bouncing, setBouncing] = React.useState(false);
  const prevCount = React.useRef(unreadCount);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Bounce the badge when the unread count increases.
  React.useEffect(() => {
    if (unreadCount > prevCount.current) {
      setBouncing(true);
      const t = setTimeout(() => setBouncing(false), 600);
      return () => clearTimeout(t);
    }
    prevCount.current = unreadCount;
  }, [unreadCount]);

  // Outside click + escape to close.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const visible: AppNotification[] = React.useMemo(
    () => (tab === "unread" ? items.filter((i) => i.unread) : items),
    [items, tab],
  );

  // Recent-and-some style: subtle dot when count > 0; warmer pill once it
  // hits a noticeable size.
  const showBadge = unreadCount > 0;
  const usePill = unreadCount >= 1; // keep pill style for any count > 0

  // Trigger button styling differs slightly between the rail (vertical
  // sidebar, square hit target) and a future header layout.
  const triggerClasses =
    variant === "rail"
      ? cn(
          "relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
          "text-text-subtle hover:bg-surface-muted hover:text-text",
          open && "bg-surface-muted text-text",
        )
      : cn(
          "relative flex h-9 w-9 items-center justify-center rounded-full transition-colors",
          "text-text-subtle hover:bg-surface-muted hover:text-text",
          open && "bg-surface-muted text-text",
        );

  // Panel anchoring: rail-mounted bells sit in the sidebar, so we anchor the
  // panel to the right of the trigger. Header bells anchor below-right.
  const panelAnchor =
    variant === "rail"
      ? "absolute bottom-12 left-12 z-50"
      : "absolute right-0 top-12 z-50";

  return (
    <div ref={containerRef} className={cn("relative flex justify-center", className)}>
      <button
        type="button"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((v) => !v);
          // Default to unread tab on open; flip back when there's nothing
          // unread so the user doesn't see an empty list.
          if (!open) setTab(unreadCount > 0 ? "unread" : "all");
        }}
        className={triggerClasses}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {showBadge && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1",
              "text-[10px] font-semibold leading-none",
              "bg-rose-500 text-white shadow-sm",
              "transition-transform",
              bouncing && "animate-bounce",
              !usePill && "h-2 w-2 min-w-0 p-0",
            )}
          >
            {usePill && (unreadCount > 99 ? "99+" : unreadCount)}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cn(
            panelAnchor,
            "w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border",
            "liquid-glass bg-surface-raised shadow-2xl backdrop-blur-xl",
            "overflow-hidden",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-text">Notifications</h2>
              {unreadCount > 0 && (
                <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-text-subtle">
                  {unreadCount} new
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className={cn(
                "text-xs text-text-subtle transition-colors hover:text-text",
                unreadCount === 0 && "cursor-default opacity-40 hover:text-text-subtle",
              )}
            >
              Mark all read
            </button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-3 pb-2">
            {(["unread", "all"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  tab === t
                    ? "bg-surface-muted text-text"
                    : "text-text-subtle hover:text-text",
                )}
              >
                {t === "unread" ? "Unread" : "All"}
              </button>
            ))}
          </div>

          {/* List */}
          <ul className="max-h-[60vh] divide-y divide-border/70 overflow-y-auto">
            {visible.length === 0 ? (
              <li className="px-4 py-10 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted">
                  <Bell className="h-5 w-5 text-text-subtle" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium text-text">
                  You&rsquo;re all caught up
                </p>
                <p className="mt-1 text-xs text-text-subtle">Nice work.</p>
              </li>
            ) : (
              visible.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onRead={markRead}
                  onDismiss={dismiss}
                />
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- row -------------------------------------------------------------

function NotificationRow({
  notification,
  onRead,
  onDismiss,
}: {
  notification: AppNotification;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const Icon = KIND_ICON[notification.kind] ?? Info;
  const tint = KIND_TINT[notification.kind] ?? "text-text-subtle";

  return (
    <li className="group relative">
      <div
        className={cn(
          "flex items-start gap-3 px-4 py-3 transition-colors",
          notification.unread && "bg-highlight-soft/30",
          "hover:bg-surface-muted/50",
        )}
      >
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-muted",
            tint,
          )}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={cn(
                "truncate text-sm",
                notification.unread ? "font-semibold text-text" : "text-text",
              )}
            >
              {notification.title}
            </p>
            <span className="shrink-0 text-[10px] text-text-subtle">
              {relativeTime(notification.createdAt)}
            </span>
          </div>
          {notification.body && (
            <p className="mt-0.5 line-clamp-2 text-xs text-text-subtle">
              {notification.body}
            </p>
          )}
          {notification.href && (
            <a
              href={notification.href}
              onClick={() => onRead(notification.id)}
              className="mt-1 inline-block text-xs font-medium text-accent hover:underline"
            >
              {notification.kind === "message"
                ? "Open thread"
                : notification.kind === "task"
                  ? "Open task"
                  : notification.kind === "lab"
                    ? "View result"
                    : "Open"}
            </a>
          )}
        </div>

        {notification.unread && (
          <span
            aria-label="Unread"
            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-rose-500"
          />
        )}

        <button
          type="button"
          onClick={() => onDismiss(notification.id)}
          aria-label="Dismiss notification"
          className={cn(
            "ml-1 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            "text-text-subtle opacity-0 transition-opacity hover:bg-surface-muted hover:text-text",
            "group-hover:opacity-100 focus:opacity-100",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
