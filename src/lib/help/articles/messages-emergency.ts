import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "messages-emergency",
  title: "Handling emergency-flagged threads",
  group: "messages-inbox",
  tags: ["emergency", "urgent", "escalation", "paging", "safety"],
  body: `Emergency-flagged threads bypass normal queueing.

- A red dot appears next to the thread and on the Inbox pillar badge. The thread floats to the top of the list.
- If your practice has on-call paging configured, the on-call clinician receives a push notification within ~30 seconds.
- AI drafting is disabled — you compose the reply yourself.
- A safety banner reminds you that "call 911" instructions are still required where appropriate.

Mis-classifications? Click the red dot to downgrade and explain in one line; the model learns.`,
};
