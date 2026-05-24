/**
 * Client-side localStorage prototype for comment threads.
 *
 * WIP — see `src/lib/collaboration/comments.ts` for the durable plan.
 * This module exists ONLY because the Prisma schema is off-limits in this
 * PR. The function surface (`list / add / update / softDelete / resolve`)
 * intentionally mirrors what a server action would expose so we can drop
 * in a real store later without changing the React components.
 *
 * Keys are namespaced `lj.comments.v1.<targetType>.<targetId>` so different
 * surfaces never collide and a future migration can scan + clear by prefix.
 */
import type { Comment, CommentTargetType } from "./comments";

const PREFIX = "lj.comments.v1";

function key(targetType: CommentTargetType, targetId: string): string {
  return `${PREFIX}.${targetType}.${targetId}`;
}

function safeRead(targetType: CommentTargetType, targetId: string): Comment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(targetType, targetId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Comment[]) : [];
  } catch {
    // A corrupted blob shouldn't take down the chart note view — silently
    // reset and return an empty list.
    return [];
  }
}

function safeWrite(
  targetType: CommentTargetType,
  targetId: string,
  comments: Comment[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key(targetType, targetId),
      JSON.stringify(comments),
    );
  } catch {
    // Quota errors are non-fatal in the prototype — surface in console only.
    // eslint-disable-next-line no-console
    console.warn("[comment-store] localStorage write failed; comment lost");
  }
}

export const commentStore = {
  list(targetType: CommentTargetType, targetId: string): Comment[] {
    return safeRead(targetType, targetId);
  },

  add(targetType: CommentTargetType, targetId: string, comment: Comment): void {
    const existing = safeRead(targetType, targetId);
    safeWrite(targetType, targetId, [...existing, comment]);
  },

  update(
    targetType: CommentTargetType,
    targetId: string,
    commentId: string,
    patch: Partial<Comment>,
  ): void {
    const existing = safeRead(targetType, targetId);
    safeWrite(
      targetType,
      targetId,
      existing.map((c) => (c.id === commentId ? { ...c, ...patch } : c)),
    );
  },

  softDelete(
    targetType: CommentTargetType,
    targetId: string,
    commentId: string,
  ): void {
    const now = new Date().toISOString();
    commentStore.update(targetType, targetId, commentId, {
      deletedAt: now,
      body: "",
      mentions: [],
    });
  },

  /**
   * Generate a sortable id. Real backend will assign uuids; until then we
   * concatenate `ms.random` so client-side ordering by id matches createdAt.
   */
  nextId(): string {
    return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  },
};
