/**
 * Notification Center — shared types
 *
 * v1 is client-only and derived from existing signals (smart inbox unread,
 * pending tasks, recent agent activity). When persistence requirements firm
 * up, promote this to a server-side `Notification` Prisma model with its own
 * read/dismissed timestamps per user. Until then the source-of-truth for
 * read/dismissed state lives in localStorage (per user, see
 * `useNotifications`).
 */

export type NotificationKind = "message" | "lab" | "task" | "system" | "agent";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  unread: boolean;
  createdAt: string; // ISO
  dismissedAt: string | null;
}

export interface UseNotificationsResult {
  items: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
}
