/**
 * Client-side fan-out for @mention notifications.
 *
 * WIP — PR #464 (`ux/notification-center-bell-linear`) is still open and its
 * notification center currently reads from in-memory demo data. Until that
 * PR lands a real source, we buffer mention notifications in localStorage
 * under a stable key so:
 *
 *   1. The center can pick them up on its next refactor by reading from the
 *      same key (`lj.notifications.v1.inbox.<userId>`),
 *   2. We can verify the wire shape end-to-end without touching Clerk /
 *      Prisma / the schema in this PR.
 *
 * When the durable backend lands this entire module collapses to a single
 * server action call.
 */
import type { Notification } from "@/lib/domain/notifications";

const INBOX_PREFIX = "lj.notifications.v1.inbox";

function inboxKey(userId: string): string {
  return `${INBOX_PREFIX}.${userId}`;
}

function readInbox(userId: string): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(inboxKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Notification[]) : [];
  } catch {
    return [];
  }
}

function writeInbox(userId: string, items: Notification[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(inboxKey(userId), JSON.stringify(items));
  } catch {
    // eslint-disable-next-line no-console
    console.warn("[mention-notifications] inbox write failed");
  }
}

/**
 * Append notifications to each target user's prototype inbox. Idempotent on
 * `id` — mentions edited and re-saved won't double-fire.
 */
export function dispatchMentionNotifications(items: Notification[]): void {
  if (typeof window === "undefined" || items.length === 0) return;
  const byUser = new Map<string, Notification[]>();
  for (const n of items) {
    const arr = byUser.get(n.userId) ?? [];
    arr.push(n);
    byUser.set(n.userId, arr);
  }
  for (const [userId, additions] of byUser.entries()) {
    const existing = readInbox(userId);
    const seen = new Set(existing.map((n) => n.id));
    const merged = [
      ...existing,
      ...additions.filter((n) => !seen.has(n.id)),
    ];
    writeInbox(userId, merged);
  }
}
