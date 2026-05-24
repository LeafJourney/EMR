import type { HelpArticle } from "@/lib/help/types";

export const article: HelpArticle = {
  id: "account-preferences",
  title: "Account & preferences",
  group: "account",
  tags: ["account", "settings", "preferences", "profile", "security"],
  body: `From **Settings → Account** you can manage:

- **Profile** — display name, credentials, NPI, signature image.
- **Security** — password, MFA factors, active sessions.
- **Notifications** — email, push, and pager channels.
- **Appearance** — light/dark mode, font size, motion preferences (respects \`prefers-reduced-motion\`).
- **Schedule defaults** — visit length, buffer time, telehealth link template.

Practice-wide settings live under **Admin → Practice** and are only editable by a practice owner.`,
};
