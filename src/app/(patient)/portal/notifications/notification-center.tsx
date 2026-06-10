"use client";

import { useState, useMemo, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type {
  Notification,
  NotificationType,
  NotificationChannel,
  NotificationPreference,
} from "@/lib/domain/notifications";
import { NOTIFICATION_CONFIG } from "@/lib/domain/notifications";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  saveNotificationPreferencesAction,
} from "./actions";

// ── Helpers ────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function NotificationIcon({ type }: { type: NotificationType }) {
  const config = NOTIFICATION_CONFIG[type];
  return (
    <div
      className={cn(
        "h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
        config.color,
        "bg-current/10"
      )}
      style={{ backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)" }}
    >
      {config.icon}
    </div>
  );
}

// ── Filter tabs ───────────────────────────────────────

type FilterValue = "all" | "unread" | NotificationType;

const FILTER_TABS: { label: string; value: FilterValue }[] = [
  { label: "All", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "Messages", value: "message_received" },
  { label: "Appointments", value: "appointment_reminder" },
  { label: "Lab Results", value: "lab_results" },
  { label: "Prescriptions", value: "prescription_ready" },
  { label: "Dosing", value: "dosing_reminder" },
  { label: "Billing", value: "billing_statement" },
];

// ── Main component ────────────────────────────────────

interface NotificationCenterProps {
  /** Real Notification rows fetched server-side, newest first. */
  initialNotifications: Notification[];
  /** Persisted per-type preferences hydrated from CommunicationPreference. */
  initialPreferences: NotificationPreference[];
}

export function NotificationCenter({
  initialNotifications,
  initialPreferences,
}: NotificationCenterProps) {
  // EMR-1116 (PJ-M2): the feed is the patient's real Notification rows.
  // Read state mutates optimistically here and persists via server actions.
  const [notifications, setNotifications] =
    useState<Notification[]>(initialNotifications);
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all");
  const [preferences, setPreferences] =
    useState<NotificationPreference[]>(initialPreferences);
  const [prefsDirty, setPrefsDirty] = useState(false);
  const [prefsSavedAt, setPrefsSavedAt] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [isSavingPrefs, startSavePrefs] = useTransition();
  const [, startMarkRead] = useTransition();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered = useMemo(() => {
    if (activeFilter === "all") return notifications;
    if (activeFilter === "unread") return notifications.filter((n) => !n.read);
    return notifications.filter((n) => n.type === activeFilter);
  }, [notifications, activeFilter]);

  function markAsRead(id: string) {
    const target = notifications.find((n) => n.id === id);
    if (!target || target.read) return;
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n
      )
    );
    startMarkRead(async () => {
      await markNotificationReadAction(id);
    });
  }

  function markAllAsRead() {
    setNotifications((prev) =>
      prev.map((n) =>
        n.read ? n : { ...n, read: true, readAt: new Date().toISOString() }
      )
    );
    startMarkRead(async () => {
      await markAllNotificationsReadAction();
    });
  }

  function toggleChannel(type: NotificationType, channel: NotificationChannel) {
    setPrefsDirty(true);
    setPreferences((prev) =>
      prev.map((p) => {
        if (p.type !== type) return p;
        const channels = p.channels.includes(channel)
          ? p.channels.filter((c) => c !== channel)
          : [...p.channels, channel];
        return { ...p, channels };
      })
    );
  }

  function toggleEnabled(type: NotificationType) {
    setPrefsDirty(true);
    setPreferences((prev) =>
      prev.map((p) =>
        p.type === type ? { ...p, enabled: !p.enabled } : p
      )
    );
  }

  function savePreferences() {
    setPrefsError(null);
    startSavePrefs(async () => {
      const result = await saveNotificationPreferencesAction(preferences);
      if (result.ok) {
        setPrefsSavedAt(result.savedAt);
        setPrefsDirty(false);
      } else {
        setPrefsError(result.error);
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Header with mark all read */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-text">
            Notifications
          </h2>
          {unreadCount > 0 && (
            <Badge tone="accent">{unreadCount} unread</Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllAsRead}>
            Mark all as read
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTER_TABS.map((tab) => {
          const isActive = activeFilter === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className={cn(
                "inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors duration-200 whitespace-nowrap",
                isActive
                  ? "bg-accent text-accent-ink shadow-sm"
                  : "bg-surface-muted/70 text-text-muted hover:bg-surface-muted hover:text-text"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Notification list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-12 rounded-xl border border-dashed border-border-strong/60 bg-surface/60">
          <h3 className="font-display text-lg text-text">No notifications</h3>
          <p className="text-sm text-text-muted mt-2 max-w-sm leading-relaxed">
            {activeFilter === "unread"
              ? "You're all caught up. No unread notifications."
              : "No notifications match this filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((notification) => {
            const config = NOTIFICATION_CONFIG[notification.type];
            return (
              <Card
                key={notification.id}
                tone={notification.read ? "default" : "raised"}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md",
                  !notification.read && "border-l-4 border-l-accent"
                )}
                onClick={() => markAsRead(notification.id)}
              >
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <NotificationIcon type={notification.type} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h4
                              className={cn(
                                "text-sm truncate",
                                notification.read
                                  ? "text-text-muted font-normal"
                                  : "text-text font-medium"
                              )}
                            >
                              {notification.title}
                            </h4>
                            <Badge
                              tone="neutral"
                              className="text-[10px] shrink-0"
                            >
                              {config.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-text-muted leading-relaxed line-clamp-2">
                            {notification.body}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-text-subtle whitespace-nowrap">
                            {timeAgo(notification.createdAt)}
                          </span>
                          {!notification.read && (
                            <span className="h-2.5 w-2.5 rounded-full bg-accent shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Notification Preferences ──────────────────── */}
      <div className="pt-4">
        <Card tone="raised">
          <CardHeader>
            <CardTitle>Notification preferences</CardTitle>
            <p className="text-sm text-text-muted mt-1">
              Choose how you want to be notified for each type of update.
            </p>
          </CardHeader>
          <CardContent>
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 items-center mb-3 pb-3 border-b border-border">
              <span className="text-xs font-medium uppercase tracking-wider text-text-subtle">
                Notification type
              </span>
              <span className="text-xs font-medium uppercase tracking-wider text-text-subtle text-center w-16">
                Enabled
              </span>
              <span className="text-xs font-medium uppercase tracking-wider text-text-subtle text-center w-16">
                In-app
              </span>
              <span className="text-xs font-medium uppercase tracking-wider text-text-subtle text-center w-16">
                Email
              </span>
              <span className="text-xs font-medium uppercase tracking-wider text-text-subtle text-center w-16">
                SMS
              </span>
            </div>

            <div className="space-y-1">
              {preferences.map((pref) => {
                const config = NOTIFICATION_CONFIG[pref.type];
                return (
                  <div
                    key={pref.type}
                    className={cn(
                      "grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 items-center py-2.5 rounded-lg px-2",
                      !pref.enabled && "opacity-50"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={cn("text-xs font-bold", config.color)}>
                        {config.icon}
                      </span>
                      <span className="text-sm text-text">{config.label}</span>
                    </div>

                    {/* Enabled toggle */}
                    <div className="flex justify-center w-16">
                      <button
                        onClick={() => toggleEnabled(pref.type)}
                        className={cn(
                          "h-5 w-9 rounded-full transition-colors duration-200 relative",
                          pref.enabled ? "bg-accent" : "bg-border-strong/40"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                            pref.enabled ? "translate-x-4" : "translate-x-0.5"
                          )}
                        />
                      </button>
                    </div>

                    {/* Channel toggles */}
                    {(["in_app", "email", "sms"] as NotificationChannel[]).map(
                      (channel) => (
                        <div key={channel} className="flex justify-center w-16">
                          <button
                            disabled={!pref.enabled}
                            onClick={() => toggleChannel(pref.type, channel)}
                            className={cn(
                              "h-5 w-5 rounded border-2 transition-all duration-200 flex items-center justify-center",
                              pref.channels.includes(channel)
                                ? "bg-accent border-accent text-white"
                                : "border-border-strong/60 hover:border-accent/40"
                            )}
                          >
                            {pref.channels.includes(channel) && (
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>

            {/* Save footer — honest persisted state, saved-at from the server */}
            <div className="flex items-center gap-3 pt-5 mt-4 border-t border-border">
              <Button
                size="sm"
                onClick={savePreferences}
                disabled={isSavingPrefs || !prefsDirty}
              >
                {isSavingPrefs ? "Saving..." : "Save preferences"}
              </Button>
              {prefsError && (
                <span className="text-sm text-danger">{prefsError}</span>
              )}
              {!prefsError && prefsSavedAt && !prefsDirty && (
                <Badge tone="success">
                  Saved{" "}
                  {new Date(prefsSavedAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
