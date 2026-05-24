import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "messages-ai-drafts",
  title: "Reviewing AI-drafted replies",
  group: "messages-inbox",
  tags: ["messages", "ai", "drafts", "reply", "sign-off"],
  body: `For routine and administrative threads, LeafJourney pre-drafts a reply for your review. Drafts are visibly tagged with a small sparkle icon and never auto-send.

- Edit the draft inline before sending.
- Hit \`Cmd+Enter\` to send as-is, or \`Cmd+Shift+E\` to edit fully.
- **Reject** removes the draft and surfaces the empty composer.
- Drafts on emergency threads are blocked — you write those.

Every send and every rejection is captured in the audit log along with the original draft text.`,
};
