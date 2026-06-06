import { requireRole } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { CompanionPanel } from "./companion-panel";

export const metadata = { title: "Your companion" };

// EMR-386 (portal-scoped) — a calm, single, trustworthy AI companion surface
// in the portal. The always-on ambient layer belongs in shared shell files
// (out of this track's scope); this is the in-scope entrypoint.
export default async function CompanionPage() {
  await requireRole("patient");

  return (
    <PageShell maxWidth="max-w-[820px]">
      <PageHeader
        eyebrow="Companion"
        title="Hi, I'm Cindy"
        description="A calm place to figure out what's next — check-ins, messages, learning, your plan, and your records, all a tap away."
      />
      <CompanionPanel />
    </PageShell>
  );
}
