import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "charts-dictation",
  title: "Dictating into a note",
  group: "charts-soap",
  tags: ["dictation", "voice", "microphone", "note"],
  body: `Every editable note field supports voice dictation.

- Click the microphone icon at the top-right of any section header, or press \`Cmd+Shift+D\` while focused inside a section.
- Speak naturally — punctuation is added automatically.
- A pulsing blue dot indicates active capture. Click again, press \`Escape\`, or stop speaking for ~3 seconds to end.
- A transcript preview appears inline before it commits. Edit it freely before saving.

Dictation never auto-saves; you always confirm.`,
};
