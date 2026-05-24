import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "getting-started-tour",
  title: "Take the clinician tour",
  group: "getting-started",
  tags: ["tour", "onboarding", "intro", "walkthrough"],
  body: `LeafJourney ships with a short guided tour that highlights the main surfaces of the clinic shell: Today, Patients, Inbox, Reference, and Admin.

- Press \`?\` anywhere to open the keyboard cheat sheet, then click **Replay tour** at the bottom.
- The tour pauses on each pillar of the side rail. Click **Next** or press \`Enter\` to step through.
- You can re-run the tour at any time — it never modifies data.

If the tour does not appear automatically on first login, your practice admin may have suppressed it in settings.`,
};
