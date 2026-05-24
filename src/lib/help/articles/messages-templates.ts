import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "messages-templates",
  title: "Saving and using message templates",
  group: "messages-inbox",
  tags: ["templates", "snippets", "messages", "reply", "macros"],
  body: `You can promote any message you send into a reusable template.

- Send a message, then click the **Save as template** link that appears next to the timestamp for ~10 seconds after send.
- Give it a short name. Templates are scoped to you by default; practice owners can promote a template to the whole practice.
- In the composer, type \`/\` to open the template picker. Up arrow and down arrow to choose, \`Enter\` to insert.

Template variables like \`{{patient.firstName}}\` are interpolated at insert time.`,
};
