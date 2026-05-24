"use client";

/**
 * `CommentThread` — collaborative comments + @mentions for any entity.
 *
 * Generic over the anchor:
 *   <CommentThread
 *     targetType="chart_note"
 *     targetId={note.id}
 *     comments={comments}
 *     roster={roster}
 *     currentAuthor={me}
 *     onSubmit={...}
 *     onResolve={...}
 *   />
 *
 * Surfaces it works on today:
 *   - chart_note (adopted in PR-on-deck)
 *   - encounter / lab_result / order / patient (drop in via props)
 *
 * Visual rules (per Apple-iOS aesthetic directive in CLAUDE.md):
 *   - Resolved threads collapse into a single "Resolved" pill with a
 *     "View" affordance — they never disappear, never block the list.
 *   - Reply box is inline under each thread, lazy-mounted on click.
 *   - Avatar/name/timestamp/body row mirrors the rest of the EMR's
 *     audit-trail style (see private-notes-tab.tsx) for consistency.
 */

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MentionInput } from "./mention-input";
import {
  buildThreads,
  extractMentions,
  type Comment,
  type CommentAuthor,
  type CommentTargetType,
  type CommentThread as CommentThreadType,
} from "@/lib/collaboration/comments";

interface CommentThreadProps {
  targetType: CommentTargetType;
  targetId: string;
  comments: Comment[];
  roster: CommentAuthor[];
  currentAuthor: CommentAuthor | null;
  /**
   * Called when the user submits a new comment (root or reply). The handler
   * receives a fully-formed `Comment` (id, mentions, timestamps already
   * baked) so the parent only needs to persist + dispatch notifications.
   */
  onSubmit: (comment: Comment) => void | Promise<void>;
  /** Toggle the `resolvedAt` state for a thread root. */
  onResolve?: (commentId: string, resolved: boolean) => void | Promise<void>;
  /** Edit the body of a previously-authored comment. */
  onEdit?: (commentId: string, nextBody: string) => void | Promise<void>;
  /** Soft-delete a comment. UI replaces body with a tombstone. */
  onDelete?: (commentId: string) => void | Promise<void>;
  /** Optional surface label for empty state and aria. */
  surfaceLabel?: string;
  className?: string;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: now - date.getTime() > 365 * 24 * 3600_000 ? "numeric" : undefined,
  });
}

/** Render a comment body, highlighting @mention spans in accent color. */
function renderBody(comment: Comment): React.ReactNode {
  if (comment.deletedAt) {
    return (
      <span className="italic text-text-muted">[comment deleted]</span>
    );
  }
  if (comment.mentions.length === 0) {
    return <span className="whitespace-pre-wrap">{comment.body}</span>;
  }
  // Splice mentions back into the rendered body. We walk left-to-right so
  // the offsets stay valid relative to the original string.
  const segments: React.ReactNode[] = [];
  let cursor = 0;
  const sorted = comment.mentions
    .slice()
    .sort((a, b) => a.offset - b.offset);
  sorted.forEach((mention, i) => {
    if (mention.offset > cursor) {
      segments.push(comment.body.slice(cursor, mention.offset));
    }
    const token = comment.body.slice(
      mention.offset,
      mention.offset + mention.length,
    );
    segments.push(
      <span
        key={`m-${i}`}
        className="rounded px-1 py-0.5 bg-accent-soft text-accent font-medium"
        title={mention.display}
      >
        {token}
      </span>,
    );
    cursor = mention.offset + mention.length;
  });
  if (cursor < comment.body.length) {
    segments.push(comment.body.slice(cursor));
  }
  return <span className="whitespace-pre-wrap">{segments}</span>;
}

interface CommentRowProps {
  comment: Comment;
  currentAuthor: CommentAuthor | null;
  onStartReply?: () => void;
  onEdit?: (next: string) => void;
  onDelete?: () => void;
  onResolveToggle?: () => void;
  roster: CommentAuthor[];
  isThreadRoot: boolean;
  isResolved: boolean;
}

function CommentRow({
  comment,
  currentAuthor,
  onStartReply,
  onEdit,
  onDelete,
  onResolveToggle,
  roster,
  isThreadRoot,
  isResolved,
}: CommentRowProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(comment.body);
  const isAuthor = currentAuthor?.id === comment.author.id;
  const canEdit = isAuthor && onEdit && !comment.deletedAt;
  const canDelete = isAuthor && onDelete && !comment.deletedAt;

  function commitEdit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === comment.body) {
      setEditing(false);
      setDraft(comment.body);
      return;
    }
    onEdit?.(trimmed);
    setEditing(false);
  }

  return (
    <div className="flex gap-3">
      <Avatar
        firstName={comment.author.firstName}
        lastName={comment.author.lastName}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-text">
            {comment.author.firstName} {comment.author.lastName}
          </span>
          <span className="text-xs text-text-muted">
            {formatTimestamp(comment.createdAt)}
            {comment.updatedAt && comment.updatedAt !== comment.createdAt && (
              <span className="ml-1 italic">(edited)</span>
            )}
          </span>
          {isResolved && isThreadRoot && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">
              Resolved
            </span>
          )}
        </div>

        {editing ? (
          <div className="mt-1">
            <MentionInput
              value={draft}
              onChange={setDraft}
              roster={roster}
              size="sm"
              rows={2}
              onSubmit={commitEdit}
              ariaLabel="Edit comment"
            />
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={commitEdit} disabled={!draft.trim()}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft(comment.body);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-1 text-sm text-text leading-relaxed">
            {renderBody(comment)}
          </div>
        )}

        {!editing && !comment.deletedAt && (
          <div className="flex gap-3 mt-1 text-xs">
            {onStartReply && (
              <button
                type="button"
                onClick={onStartReply}
                className="text-text-muted hover:text-accent transition-colors"
              >
                Reply
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-text-muted hover:text-accent transition-colors"
              >
                Edit
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="text-text-muted hover:text-danger transition-colors"
              >
                Delete
              </button>
            )}
            {isThreadRoot && onResolveToggle && (
              <button
                type="button"
                onClick={onResolveToggle}
                className="text-text-muted hover:text-success transition-colors"
              >
                {isResolved ? "Reopen" : "Resolve"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentThread({
  targetType,
  targetId,
  comments,
  roster,
  currentAuthor,
  onSubmit,
  onResolve,
  onEdit,
  onDelete,
  surfaceLabel = "this item",
  className,
}: CommentThreadProps) {
  const threads = React.useMemo(() => buildThreads(comments), [comments]);
  const [rootDraft, setRootDraft] = React.useState("");
  const [replyingTo, setReplyingTo] = React.useState<string | null>(null);
  const [replyDraft, setReplyDraft] = React.useState("");
  const [expandedResolved, setExpandedResolved] = React.useState<Set<string>>(
    new Set(),
  );
  const [submitting, setSubmitting] = React.useState(false);

  function buildComment(body: string, parentId: string | null): Comment | null {
    const trimmed = body.trim();
    if (!trimmed || !currentAuthor) return null;
    const now = new Date().toISOString();
    return {
      id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      targetType,
      targetId,
      author: currentAuthor,
      body: trimmed,
      mentions: extractMentions(trimmed, roster),
      createdAt: now,
      parentId,
      resolvedAt: null,
      resolvedBy: null,
      deletedAt: null,
    };
  }

  async function submitRoot() {
    const c = buildComment(rootDraft, null);
    if (!c) return;
    setSubmitting(true);
    try {
      await onSubmit(c);
      setRootDraft("");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReply(parentId: string) {
    const c = buildComment(replyDraft, parentId);
    if (!c) return;
    setSubmitting(true);
    try {
      await onSubmit(c);
      setReplyDraft("");
      setReplyingTo(null);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleResolvedExpanded(id: string) {
    setExpandedResolved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const openThreads = threads.filter((t) => !t.root.resolvedAt);
  const resolvedThreads = threads.filter((t) => t.root.resolvedAt);

  return (
    <section
      aria-label={`Comments on ${surfaceLabel}`}
      className={cn("rounded-2xl border border-border bg-surface", className)}
    >
      <header className="px-5 py-4 border-b border-border flex items-baseline justify-between">
        <h3 className="font-display text-base text-text">
          Comments
          {threads.length > 0 && (
            <span className="ml-2 text-xs text-text-muted font-sans">
              {openThreads.length} open
              {resolvedThreads.length > 0 &&
                ` · ${resolvedThreads.length} resolved`}
            </span>
          )}
        </h3>
      </header>

      {/* Root composer */}
      {currentAuthor ? (
        <div className="p-5 border-b border-border bg-surface-raised/30">
          <div className="flex gap-3">
            <Avatar
              firstName={currentAuthor.firstName}
              lastName={currentAuthor.lastName}
              size="sm"
            />
            <div className="flex-1">
              <MentionInput
                value={rootDraft}
                onChange={setRootDraft}
                roster={roster}
                placeholder={`Add a comment on ${surfaceLabel}… use @ to mention a teammate`}
                onSubmit={submitRoot}
                disabled={submitting}
                ariaLabel="New comment"
              />
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-text-muted">
                  Use @ to mention · ⌘⏎ to send
                </p>
                <Button
                  size="sm"
                  onClick={submitRoot}
                  disabled={!rootDraft.trim() || submitting}
                >
                  Comment
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5 text-sm text-text-muted">
          Sign in to add comments.
        </div>
      )}

      {/* Thread list */}
      <div className="p-5 space-y-6">
        {openThreads.length === 0 && resolvedThreads.length === 0 && (
          <p className="text-sm text-text-muted text-center py-6">
            No comments yet. Be the first to start a conversation.
          </p>
        )}

        {openThreads.map((thread) => (
          <ThreadBlock
            key={thread.root.id}
            thread={thread}
            currentAuthor={currentAuthor}
            roster={roster}
            replyingTo={replyingTo}
            replyDraft={replyDraft}
            setReplyDraft={setReplyDraft}
            setReplyingTo={setReplyingTo}
            submitting={submitting}
            onSubmitReply={() => submitReply(thread.root.id)}
            onResolve={onResolve}
            onEdit={onEdit}
            onDelete={onDelete}
            collapsed={false}
          />
        ))}

        {resolvedThreads.length > 0 && (
          <div className="pt-4 border-t border-border space-y-3">
            <p className="text-xs uppercase tracking-wide text-text-muted">
              Resolved
            </p>
            {resolvedThreads.map((thread) => {
              const expanded = expandedResolved.has(thread.root.id);
              return (
                <div
                  key={thread.root.id}
                  className="rounded-xl border border-border bg-surface-raised/30 px-4 py-3"
                >
                  <button
                    type="button"
                    onClick={() => toggleResolvedExpanded(thread.root.id)}
                    className="w-full text-left flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar
                        firstName={thread.root.author.firstName}
                        lastName={thread.root.author.lastName}
                        size="sm"
                      />
                      <span className="text-sm text-text-muted truncate">
                        <span className="font-medium text-text">
                          {thread.root.author.firstName}
                        </span>
                        {": "}
                        {thread.root.body.slice(0, 80)}
                        {thread.root.body.length > 80 ? "…" : ""}
                      </span>
                    </div>
                    <span className="text-xs text-accent shrink-0">
                      {expanded ? "Collapse" : "View"}
                    </span>
                  </button>
                  {expanded && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <ThreadBlock
                        thread={thread}
                        currentAuthor={currentAuthor}
                        roster={roster}
                        replyingTo={replyingTo}
                        replyDraft={replyDraft}
                        setReplyDraft={setReplyDraft}
                        setReplyingTo={setReplyingTo}
                        submitting={submitting}
                        onSubmitReply={() => submitReply(thread.root.id)}
                        onResolve={onResolve}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        collapsed
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

interface ThreadBlockProps {
  thread: CommentThreadType;
  currentAuthor: CommentAuthor | null;
  roster: CommentAuthor[];
  replyingTo: string | null;
  replyDraft: string;
  setReplyDraft: (s: string) => void;
  setReplyingTo: (id: string | null) => void;
  submitting: boolean;
  onSubmitReply: () => void;
  onResolve?: (commentId: string, resolved: boolean) => void | Promise<void>;
  onEdit?: (commentId: string, nextBody: string) => void | Promise<void>;
  onDelete?: (commentId: string) => void | Promise<void>;
  collapsed: boolean;
}

function ThreadBlock({
  thread,
  currentAuthor,
  roster,
  replyingTo,
  replyDraft,
  setReplyDraft,
  setReplyingTo,
  submitting,
  onSubmitReply,
  onResolve,
  onEdit,
  onDelete,
  collapsed,
}: ThreadBlockProps) {
  const isResolved = Boolean(thread.root.resolvedAt);
  const showReplyBox = replyingTo === thread.root.id;

  return (
    <div className="space-y-4">
      <CommentRow
        comment={thread.root}
        currentAuthor={currentAuthor}
        roster={roster}
        isThreadRoot
        isResolved={isResolved}
        onStartReply={
          collapsed
            ? undefined
            : () => {
                setReplyingTo(thread.root.id);
                setReplyDraft("");
              }
        }
        onEdit={
          onEdit ? (next) => onEdit(thread.root.id, next) : undefined
        }
        onDelete={onDelete ? () => onDelete(thread.root.id) : undefined}
        onResolveToggle={
          onResolve ? () => onResolve(thread.root.id, !isResolved) : undefined
        }
      />

      {thread.replies.length > 0 && (
        <div className="pl-10 space-y-4 border-l-2 border-border ml-3">
          {thread.replies.map((reply) => (
            <CommentRow
              key={reply.id}
              comment={reply}
              currentAuthor={currentAuthor}
              roster={roster}
              isThreadRoot={false}
              isResolved={isResolved}
              onEdit={
                onEdit ? (next) => onEdit(reply.id, next) : undefined
              }
              onDelete={onDelete ? () => onDelete(reply.id) : undefined}
            />
          ))}
        </div>
      )}

      {showReplyBox && currentAuthor && !collapsed && (
        <div className="pl-10 ml-3">
          <MentionInput
            value={replyDraft}
            onChange={setReplyDraft}
            roster={roster}
            placeholder="Write a reply…"
            size="sm"
            rows={2}
            onSubmit={onSubmitReply}
            disabled={submitting}
            ariaLabel="Reply to comment"
          />
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              onClick={onSubmitReply}
              disabled={!replyDraft.trim() || submitting}
            >
              Reply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setReplyingTo(null);
                setReplyDraft("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
