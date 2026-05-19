// EMR-123 — Researcher portal layout.
//
// "researcher" is not yet in the Role enum, so the portal is gated to
// operator + practice_owner + system today. When the role is added,
// flip the allowlist to `researcher` only and audit accordingly.

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AppShell, type NavSection } from "@/components/shell/AppShell";
import { ROLE_HOME } from "@/lib/rbac/roles";

const RESEARCHER_SECTIONS: NavSection[] = [
  {
    label: "Portal",
    pillar: "overview",
    items: [
      { label: "Overview", href: "/research-portal" },
      { label: "My cohorts", href: "/research-portal/cohorts" },
      { label: "Manifests", href: "/research-portal/manifests" },
    ],
  },
  {
    label: "Studies",
    items: [
      { label: "Active studies", href: "/research-portal/studies" },
      { label: "Allocation roster", href: "/research-portal/studies/roster" },
    ],
  },
];

export default async function ResearcherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const allowed = user.roles.some(
    (r) => r === "operator" || r === "practice_owner" || r === "system",
  );
  if (!allowed) {
    const primary = user.roles[0];
    redirect(ROLE_HOME[primary] ?? "/");
  }

  return (
    <AppShell
      user={user}
      activeRole="operator"
      sections={RESEARCHER_SECTIONS}
      roleLabel="Researcher portal"
    >
      {children}
    </AppShell>
  );
}
