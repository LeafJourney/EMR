/**
 * Shared types for the in-app help drawer.
 *
 * Articles are authored as TypeScript modules under
 * `src/lib/help/articles/` — each exports an `HelpArticle` literal.
 * Keeping them as TS (rather than `.md` with a custom loader) means
 * we don't have to touch the Next/webpack config to ship the
 * drawer.
 *
 * Bodies are written in lightly-marked-down plain text:
 *   - paragraphs separated by a blank line
 *   - bullet lists with leading `- `
 *   - `**bold**`, `` `code` `` are rendered with inline tokens
 * The renderer lives in `src/components/help/markdown-lite.tsx`.
 */

export type HelpGroupId =
  | "getting-started"
  | "charts-soap"
  | "messages-inbox"
  | "practice-manager"
  | "shortcuts"
  | "account";

export interface HelpGroup {
  id: HelpGroupId;
  label: string;
  /** Short blurb shown under the group label on the index. */
  blurb: string;
}

export interface HelpArticle {
  id: string;
  title: string;
  group: HelpGroupId;
  tags: string[];
  /** Markdown-lite body (see top-of-file note). */
  body: string;
}

export const HELP_GROUPS: HelpGroup[] = [
  {
    id: "getting-started",
    label: "Getting started",
    blurb: "Tour, layout, and your first chart.",
  },
  {
    id: "charts-soap",
    label: "Charts & SOAP notes",
    blurb: "Note structure, dictation, sign-off, whispers.",
  },
  {
    id: "messages-inbox",
    label: "Messages & inbox",
    blurb: "Triage, AI drafts, templates, emergencies.",
  },
  {
    id: "practice-manager",
    label: "Practice Manager Agent",
    blurb: "What runs overnight and how to dial autonomy.",
  },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    blurb: "Open the Linear-style cheat sheet.",
  },
  {
    id: "account",
    label: "Account & preferences",
    blurb: "Profile, security, appearance.",
  },
];
