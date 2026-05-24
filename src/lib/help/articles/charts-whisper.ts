import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "charts-whisper",
  title: "Visit discovery whispers",
  group: "charts-soap",
  tags: ["whisper", "ai", "discovery", "visit", "suggestions"],
  body: `While you are in a chart, the Visit Discovery Whisperer surfaces short, dismissible suggestions in the bottom-right corner.

Examples:

- "Last A1c was 90 days ago — order today?"
- "Patient reported new tinnitus in messages — add to Subjective?"
- "Cannabis log shows worsening sleep — revisit dose?"

Whispers never act on their own. Click a whisper to accept the suggestion into the note, or dismiss to log a "not now". Dismissals train the model down over time.`,
};
