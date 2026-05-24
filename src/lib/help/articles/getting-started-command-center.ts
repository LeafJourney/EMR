import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "getting-started-command-center",
  title: "Your Command Center",
  group: "getting-started",
  tags: ["command-center", "dashboard", "today", "home"],
  body: `The Command Center at \`/clinic/command\` is the single screen where LeafJourney expects you to start your day.

- The top strip shows your next three appointments and any emergency messages.
- The middle band surfaces the unified Sign-off queue: labs awaiting review, refills pending, AI-drafted notes, and AI-drafted messages.
- The bottom band shows agent activity — what the Practice Manager Agent has done overnight on your behalf.

Click any tile to drop into the relevant queue. Nothing on this screen is destructive.`,
};
