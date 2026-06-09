// EMR-808 — pure derivations for message-thread UI state, extracted so they're
// unit-testable away from Prisma and the server component.

/**
 * A thread is resolved while its resolve mark is at or after the last activity.
 * A newer patient reply (lastMessageAt > resolvedAt) re-opens it automatically.
 */
export function isThreadResolved(
  resolvedAt: Date | null | undefined,
  lastMessageAt: Date,
): boolean {
  return !!resolvedAt && resolvedAt.getTime() >= lastMessageAt.getTime();
}

export interface UnreadCountMessage {
  status: string;
  senderUserId: string | null;
  senderAgent: string | null;
}

/**
 * Count inbound, unread messages in a thread: authored by someone other than
 * the current clinician, not an AI draft, and not yet marked read. This is the
 * value persisted by markThreadRead — so it survives a refresh.
 */
export function unreadInboundCount(
  messages: UnreadCountMessage[],
  currentUserId: string,
): number {
  return messages.filter(
    (m) => m.status !== "read" && m.senderUserId !== currentUserId && !m.senderAgent,
  ).length;
}
