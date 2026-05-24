import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "keyboard-shortcuts",
  title: "Keyboard shortcuts",
  group: "shortcuts",
  tags: ["shortcuts", "keyboard", "hotkeys", "productivity"],
  body: `LeafJourney ships with a Linear-style cheat sheet covering every shortcut in the app.

Press \`?\` anywhere to open it. Highlights:

- \`g\` then \`i\` — go to Inbox
- \`g\` then \`s\` — go to Sign-off
- \`g\` then \`c\` — go to Command Center
- \`Cmd+K\` — open the global command palette
- \`Cmd+Shift+D\` — start dictation in the focused note section
- \`Cmd+Enter\` — send the focused draft

You can also replay the clinician tour from the cheat sheet.`,
};
