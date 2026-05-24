import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "getting-started-first-chart",
  title: "Opening your first chart",
  group: "getting-started",
  tags: ["chart", "patient", "roster", "intro"],
  body: `From **Patients → Roster** you can:

- Type any part of a patient's name, MRN, or DOB in the top search bar — results stream in as you type.
- Use the filter chips on the right to narrow by visit type, last contact, or care team.
- Click a row, or hit \`Enter\` on the keyboard-focused row, to open the chart in the right pane.

Charts always open to the most recent encounter. Use the chart tabs to move between Problems, Meds, Labs, Notes, and Plan.`,
};
