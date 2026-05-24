import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "charts-signing",
  title: "Signing notes, labs, and refills",
  group: "charts-soap",
  tags: ["sign-off", "signature", "attestation", "queue"],
  body: `The unified **Sign-off** queue at \`/clinic/sign-off\` is your single end-of-day surface. It collapses four categories:

- AI-drafted patient messages
- Lab results awaiting clinician review
- Refill requests waiting on a decision
- Notes drafted from telehealth or intake

Each item shows the originating context, a one-line summary, and an **Approve** / **Edit** / **Reject** triad. Bulk-approve is available when no item carries an emergency flag.

Every sign-off writes a signed attestation row to the audit log.`,
};
