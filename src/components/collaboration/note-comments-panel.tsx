"use client";

/**
 * `NoteCommentsPanel` — adoption wrapper for the chart-note detail surface.
 *
 * Owns the localStorage prototype state, fetches the org roster once on
 * mount, stamps comments with the current author, and fans out @mention
 * notifications via the prototype dispatcher (PR #464 will swap this for
 * a real backend later).
 *
 * Keep this file thin: real product logic lives in <CommentThread/>. This
 * wrapper is the seam where the durable backend lands when the schema is
 * unblocked.
 */

import * as React from "react";
import { CommentThread } from "./comment-thread";
import {
  buildMentionNotifications,
  extractMentions,
  type Comment,
  type CommentAuthor,
} from "@/lib/collaboration/comments";
import { commentStore } from "@/lib/collaboration/comment-store";
import { dispatchMentionNotifications } from "@/lib/collaboration/mention-notifications";
import {
  getCurrentCommentAuthor,
  listOrgMembersForMention,
} from "@/app/actions/collaborationActions";

interface NoteCommentsPanelProps {
  noteId: string;
  patientId: string;
  className?: string;
}

export function NoteCommentsPanel({
  noteId,
  patientId,
  className,
}: NoteCommentsPanelProps) {
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [roster, setRoster] = React.useState<CommentAuthor[]>([]);
  const [currentAuthor, setCurrentAuthor] =
    React.useState<CommentAuthor | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  // Hydrate from localStorage + server-side roster on mount.
  React.useEffect(() => {
    setComments(commentStore.list("chart_note", noteId));
    setHydrated(true);
    let cancelled = false;
    Promise.all([
      listOrgMembersForMention(),
      getCurrentCommentAuthor(),
    ])
      .then(([members, me]) => {
        if (cancelled) return;
        setRoster(members);
        setCurrentAuthor(me);
      })
      .catch(() => {
        // Roster fetch failure shouldn't break the comment view — users just
        // won't get autocomplete suggestions.
        if (!cancelled) setRoster([]);
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  const handleSubmit = React.useCallback(
    (comment: Comment) => {
      commentStore.add("chart_note", noteId, comment);
      setComments((prev) => [...prev, comment]);
      if (comment.mentions.length > 0) {
        const href = `/clinic/patients/${patientId}/notes/${noteId}`;
        const surfaceLabel = "Chart note comment";
        dispatchMentionNotifications(
          buildMentionNotifications(comment, surfaceLabel, href),
        );
      }
    },
    [noteId, patientId],
  );

  const handleResolve = React.useCallback(
    (commentId: string, resolved: boolean) => {
      const now = new Date().toISOString();
      commentStore.update("chart_note", noteId, commentId, {
        resolvedAt: resolved ? now : null,
        resolvedBy: resolved ? currentAuthor : null,
      });
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? {
                ...c,
                resolvedAt: resolved ? now : null,
                resolvedBy: resolved ? currentAuthor : null,
              }
            : c,
        ),
      );
    },
    [noteId, currentAuthor],
  );

  const handleEdit = React.useCallback(
    (commentId: string, nextBody: string) => {
      const now = new Date().toISOString();
      // Re-extract mentions from the new body so the highlights / fan-out
      // stay in sync.
      if (!comments.some((c) => c.id === commentId)) return;
      const mentions = extractMentions(nextBody, roster);
      commentStore.update("chart_note", noteId, commentId, {
        body: nextBody,
        mentions,
        updatedAt: now,
      });
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, body: nextBody, mentions, updatedAt: now }
            : c,
        ),
      );
    },
    [comments, noteId, roster],
  );

  const handleDelete = React.useCallback(
    (commentId: string) => {
      commentStore.softDelete("chart_note", noteId, commentId);
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, deletedAt: new Date().toISOString(), body: "", mentions: [] }
            : c,
        ),
      );
    },
    [noteId],
  );

  // Avoid hydration-mismatch flicker: SSR renders zero comments, then we
  // patch in from localStorage after mount. Render a stable wrapper either
  // way so the layout doesn't jump.
  return (
    <div className={className}>
      <div className="mb-2 text-xs text-text-muted italic">
        WIP prototype: comments are stored locally in your browser until the
        durable backend ships. @mentions queue into the notification center
        inbox.
      </div>
      <CommentThread
        targetType="chart_note"
        targetId={noteId}
        comments={hydrated ? comments : []}
        roster={roster}
        currentAuthor={currentAuthor}
        onSubmit={handleSubmit}
        onResolve={handleResolve}
        onEdit={handleEdit}
        onDelete={handleDelete}
        surfaceLabel="this chart note"
      />
    </div>
  );
}
