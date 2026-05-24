/**
 * Help drawer content index + client-side fuzzy search.
 *
 * Articles live as TypeScript modules under
 * `src/lib/help/articles/` — each exports a single `article`
 * `HelpArticle` literal. We aggregate them here and expose:
 *
 *   - `HELP_ARTICLES` / `HELP_GROUPS` — full content registry
 *   - `articlesByGroup`, `articleById` — convenience lookups
 *   - `searchHelp(query)` — zero-dep ranked search across
 *     title + tags + body, with a body snippet for inline preview
 *
 * The drawer UI in `src/components/help/help-drawer.tsx` is the
 * only caller. No server round-trip happens — search runs entirely
 * in the browser bundle.
 */

import {
  HELP_GROUPS,
  type HelpArticle,
  type HelpGroup,
  type HelpGroupId,
} from "@/lib/help/types";

import { article as accountPreferences } from "@/lib/help/articles/account-preferences";
import { article as chartsDictation } from "@/lib/help/articles/charts-dictation";
import { article as chartsSigning } from "@/lib/help/articles/charts-signing";
import { article as chartsSoapStructure } from "@/lib/help/articles/charts-soap-structure";
import { article as chartsWhisper } from "@/lib/help/articles/charts-whisper";
import { article as gettingStartedCommandCenter } from "@/lib/help/articles/getting-started-command-center";
import { article as gettingStartedFirstChart } from "@/lib/help/articles/getting-started-first-chart";
import { article as gettingStartedShell } from "@/lib/help/articles/getting-started-shell";
import { article as gettingStartedTour } from "@/lib/help/articles/getting-started-tour";
import { article as keyboardShortcuts } from "@/lib/help/articles/keyboard-shortcuts";
import { article as messagesAiDrafts } from "@/lib/help/articles/messages-ai-drafts";
import { article as messagesEmergency } from "@/lib/help/articles/messages-emergency";
import { article as messagesTemplates } from "@/lib/help/articles/messages-templates";
import { article as messagesTriage } from "@/lib/help/articles/messages-triage";
import { article as practiceManagerAgent } from "@/lib/help/articles/practice-manager-agent";
import { article as practiceManagerControls } from "@/lib/help/articles/practice-manager-controls";

export { HELP_GROUPS };
export type { HelpArticle, HelpGroup, HelpGroupId };

export const HELP_ARTICLES: HelpArticle[] = [
  gettingStartedTour,
  gettingStartedShell,
  gettingStartedCommandCenter,
  gettingStartedFirstChart,
  chartsSoapStructure,
  chartsDictation,
  chartsSigning,
  chartsWhisper,
  messagesTriage,
  messagesAiDrafts,
  messagesTemplates,
  messagesEmergency,
  practiceManagerAgent,
  practiceManagerControls,
  keyboardShortcuts,
  accountPreferences,
];

export function articlesByGroup(group: HelpGroupId): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.group === group);
}

export function articleById(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.id === id);
}

export interface HelpSearchHit {
  article: HelpArticle;
  score: number;
  /** First body snippet that matched, for inline preview. */
  snippet?: string;
}

/**
 * Tiny ranked search:
 *   - lowercase, split query on whitespace
 *   - per-term: 8× title hit, 4× tag hit, 1× body hit
 *   - require every term to hit at least one field
 *
 * No deps; perfectly fine for ~16 short articles.
 */
export function searchHelp(query: string): HelpSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const hits: HelpSearchHit[] = [];
  for (const article of HELP_ARTICLES) {
    const title = article.title.toLowerCase();
    const tags = article.tags.map((t) => t.toLowerCase());
    const body = article.body.toLowerCase();

    let score = 0;
    let allMatched = true;
    let snippet: string | undefined;

    for (const term of terms) {
      let termScore = 0;
      if (title.includes(term)) termScore += 8;
      if (tags.some((t) => t.includes(term))) termScore += 4;
      const bodyIdx = body.indexOf(term);
      if (bodyIdx !== -1) {
        termScore += 1;
        if (!snippet) {
          const start = Math.max(0, bodyIdx - 32);
          const end = Math.min(body.length, bodyIdx + term.length + 64);
          snippet =
            (start > 0 ? "…" : "") +
            article.body.slice(start, end).replace(/\s+/g, " ").trim() +
            (end < body.length ? "…" : "");
        }
      }
      if (termScore === 0) {
        allMatched = false;
        break;
      }
      score += termScore;
    }

    if (allMatched && score > 0) {
      hits.push({ article, score, snippet });
    }
  }

  return hits.sort((a, b) => b.score - a.score);
}
