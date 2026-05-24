/**
 * Comment + @mention primitives for clinician collaboration.
 *
 * WIP / prototype scope (2026-05):
 *   - No Prisma `Comment` model exists yet (schema is off-limits in this PR).
 *   - The reusable React primitives live under `src/components/collaboration/`
 *     and accept comments via props, so the storage layer can be swapped from
 *     localStorage to a real server-backed table without UI churn.
 *   - When the durable schema lands, this file's types become the wire shape.
 *
 * Sibling: PR #464 (`ux/notification-center-bell-linear`) introduces the
 * in-app notification model. We import its `Notification` shape directly so
 * @mention fan-out drops into that center as soon as a real persistence
 * layer is in place.
 */
import type { Notification } from "@/lib/domain/notifications";

/** Anchor surface a comment thread is attached to. */
export type CommentTargetType =
  | "chart_note"
  | "encounter"
  | "lab_result"
  | "patient"
  | "order"
  | "task"
  | "document";

/** Lightweight org-member shape for @mention autocomplete + author display. */
export interface CommentAuthor {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  avatarUrl?: string | null;
}

/** A single mention reference inside a comment body. */
export interface Mention {
  userId: string;
  /** Display label used at insertion time (e.g. "Maya R."). */
  display: string;
  /** Char offset within `body` where the @handle starts. */
  offset: number;
  /** Length of the rendered `@handle` token (inclusive of the leading `@`). */
  length: number;
}

export interface Comment {
  id: string;
  targetType: CommentTargetType;
  targetId: string;
  author: CommentAuthor;
  body: string;
  mentions: Mention[];
  createdAt: string;
  updatedAt?: string;
  /** Resolved threads collapse in the UI. A resolved root collapses replies too. */
  resolvedAt?: string | null;
  resolvedBy?: CommentAuthor | null;
  /** Top-level comments have `parentId === null`. */
  parentId: string | null;
  /** Soft-delete tombstone so reply threading survives. */
  deletedAt?: string | null;
}

/** UI-ready tree node: a root comment plus its flat reply list. */
export interface CommentThread {
  root: Comment;
  replies: Comment[];
}

/**
 * Group a flat list into root threads. Replies are sorted oldest-first under
 * each root. Roots are sorted newest-first so active conversations float up.
 */
export function buildThreads(comments: Comment[]): CommentThread[] {
  const roots = comments.filter((c) => c.parentId === null);
  const byParent = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parentId) {
      const arr = byParent.get(c.parentId) ?? [];
      arr.push(c);
      byParent.set(c.parentId, arr);
    }
  }
  return roots
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((root) => ({
      root,
      replies: (byParent.get(root.id) ?? []).sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : 1,
      ),
    }));
}

/**
 * Extract `@firstname` tokens from a body and resolve them against the org
 * roster. Tokens that don't match any member are silently dropped — we never
 * want a stale handle to fire a phantom notification.
 */
export function extractMentions(
  body: string,
  roster: CommentAuthor[],
): Mention[] {
  const out: Mention[] = [];
  // Match a leading `@` followed by 1-40 word chars / dashes / dots. We stop
  // at whitespace so multi-word names are addressed by first name only.
  const re = /@([\w.-]{1,40})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const handle = m[1].toLowerCase();
    const match = roster.find(
      (u) =>
        u.firstName.toLowerCase() === handle ||
        `${u.firstName}.${u.lastName}`.toLowerCase() === handle ||
        u.email?.toLowerCase().split("@")[0] === handle,
    );
    if (match) {
      out.push({
        userId: match.id,
        display: `${match.firstName} ${match.lastName}`.trim(),
        offset: m.index,
        length: m[0].length,
      });
    }
  }
  return out;
}

/**
 * Build the in-app `Notification` payload that should fan out to each
 * mentioned user. We funnel into the `system` channel because PR #464 hasn't
 * landed a dedicated `mention` type yet — and `system` is the explicit
 * catch-all in `NOTIFICATION_CONFIG`.
 */
export function buildMentionNotifications(
  comment: Comment,
  surfaceLabel: string,
  href: string,
): Notification[] {
  return comment.mentions.map((mention) => ({
    id: `mention_${comment.id}_${mention.userId}`,
    userId: mention.userId,
    type: "system",
    priority: "normal",
    title: `${comment.author.firstName} ${comment.author.lastName} mentioned you`.trim(),
    body: `${surfaceLabel}: ${comment.body.slice(0, 140)}${comment.body.length > 140 ? "…" : ""}`,
    href,
    read: false,
    createdAt: comment.createdAt,
    metadata: {
      source: "comment_mention",
      commentId: comment.id,
      targetType: comment.targetType,
      targetId: comment.targetId,
    },
  }));
}
