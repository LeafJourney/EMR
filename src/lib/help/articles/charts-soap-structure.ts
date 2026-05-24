import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "charts-soap-structure",
  title: "How SOAP notes are structured",
  group: "charts-soap",
  tags: ["soap", "apso", "note", "chart", "structure"],
  body: `LeafJourney follows the SOAP / APSO convention with one important rule: **the Objective section is human-only**.

- **Subjective** — patient-reported. AI may draft from intake and prior notes.
- **Objective** — vitals, exam findings. **No AI drafting.** You type or dictate this yourself.
- **Assessment** — your clinical impression. AI may suggest, you decide.
- **Plan** — orders, follow-up, patient-facing instructions. AI may draft; you sign.

This load-bearing rule keeps the exam record clean and is enforced in the editor.`,
};
