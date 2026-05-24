import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "practice-manager-controls",
  title: "Configuring Practice Manager Agent autonomy",
  group: "practice-manager",
  tags: ["agent", "settings", "autonomy", "controls", "practice-manager"],
  body: `In **Settings → Agents → Practice Manager**, practice owners can dial PMA autonomy per category:

- **Off** — agent runs nothing in this category.
- **Suggest** — drafts surface in Sign-off, nothing leaves the practice without a clinician.
- **Auto-send (low-risk only)** — administrative replies and refill confirmations within your written protocols can go out without per-message sign-off; an attestation row is still written.

Clinician-level overrides are honored: if you set messages to **Suggest** for yourself, the practice setting cannot raise it.`,
};
