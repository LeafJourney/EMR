/**
 * Shared note-status → badge mapping (WS-A items 2 & 3).
 *
 * One source of truth for how a clinical note's lifecycle status is labelled
 * and toned, so the page header (page.tsx, server) and the editor
 * (note-editor.tsx, client) never drift. Plain module — no React, no "use
 * client" — so both a Server and a Client Component can import it.
 *
 * `needs_review` is intentionally absent: it is never set on a note anywhere
 * in the codebase (audit minor #5), so it falls through to the default and is
 * not treated as a first-class state here.
 */
export type NoteStatusTone = "neutral" | "success" | "warning" | "info";

export interface NoteStatusBadge {
  label: string;
  tone: NoteStatusTone;
}

export function noteStatusBadge(status: string): NoteStatusBadge {
  switch (status) {
    case "finalized":
      return { label: "Signed", tone: "success" };
    case "amended":
      return { label: "Amended", tone: "info" };
    case "pending_cosign":
      return { label: "Awaiting co-signature", tone: "warning" };
    case "draft":
      return { label: "Draft", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}
