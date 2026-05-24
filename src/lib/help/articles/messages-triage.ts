import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "messages-triage",
  title: "How inbox triage works",
  group: "messages-inbox",
  tags: ["messages", "triage", "urgency", "inbox", "emergency"],
  body: `Inbound patient messages run through a triage classifier that tags each thread with one of four urgency levels:

- **Emergency** — red dot, jumps to the top, paged to on-call if configured.
- **Urgent** — orange, surfaces in the next-24h band.
- **Routine** — neutral, falls into the regular queue.
- **Administrative** — grey, routed to front office by default.

You can re-classify any thread by clicking the urgency dot. Your correction trains the classifier for your practice.`,
};
