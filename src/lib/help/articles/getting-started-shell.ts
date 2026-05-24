import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "getting-started-shell",
  title: "Navigating the clinic shell",
  group: "getting-started",
  tags: ["navigation", "layout", "sidebar", "rail"],
  body: `The clinician surface is organized into five pillars in the side rail:

- **Today** — Overview, Command Center, Schedule, Telehealth.
- **Patients** — your roster and chart search.
- **Inbox** — Messages and the unified Sign-off queue (labs, refills, notes, messages).
- **Reference** — Providers, Research, Library, Communications.
- **Admin** — Audit Trail and Morning Brief.

Badges on Inbox items reflect live counts of pending sign-offs and emergency-flagged drafts.`,
};
