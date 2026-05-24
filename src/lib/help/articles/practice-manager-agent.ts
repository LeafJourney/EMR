import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "practice-manager-agent",
  title: "What the Practice Manager Agent does overnight",
  group: "practice-manager",
  tags: ["agent", "automation", "overnight", "practice-manager", "pma"],
  body: `The Practice Manager Agent (PMA) runs on a low-key schedule between visits and overnight. It never writes to the chart; it only stages.

Typical PMA outputs:

- **Drafts** for routine messages and refills, ready for your sign-off.
- **Flags** on threads that look emergency-shaped.
- **Backlog rollups** on your Morning Brief so you start the day knowing what is waiting.
- **Quiet retries** of any external integration (labs, pharmacy) that bounced.

You can see every action the PMA took in **Admin → Audit Trail**, filtered by actor \`practice-manager-agent\`.`,
};
