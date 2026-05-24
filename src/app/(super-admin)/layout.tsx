import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { bootstrapSuperAdminIfAllowlisted } from "@/lib/auth/super-admin-bootstrap";
import { AppShell, type NavSection } from "@/components/shell/AppShell";
import { ImpersonationBanner } from "@/components/super-admin/impersonation-banner";
import { ROLE_LABELS } from "@/lib/rbac/roles";

export const dynamic = "force-dynamic";

const SUPER_ADMIN_SECTIONS: NavSection[] = [
  {
    pillar: "onboarding",
    icon: "clipboard-check",
    label: "Onboarding",
    items: [{ label: "Onboarding", href: "/onboarding" }],
  },
  {
    pillar: "practices",
    icon: "building",
    label: "Practices",
    items: [{ label: "Practices", href: "/practices" }],
  },
  {
    pillar: "templates",
    icon: "layout-grid",
    label: "Templates",
    items: [{ label: "Templates", href: "/templates" }],
  },
  {
    pillar: "admin",
    icon: "settings",
    label: "Admin",
    items: [{ label: "Console", href: "/admin" }],
  },
];

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await requireUser();
    await bootstrapSuperAdminIfAllowlisted(user);
    await requireSuperAdmin();
  } catch (err) {
    const code = err instanceof Error ? err.message : "FORBIDDEN";
    if (code === "UNAUTHORIZED") redirect("/sign-in");
    redirect("/");
  }

  return (
    <>
      {/* EMR-742 Phase 2 — Spans the entire viewport (sticky top). Renders
          nothing when there is no active impersonation session. Mounted
          above AppShell so it sits above the role rail / drawer rather
          than being clipped by them. */}
      <ImpersonationBanner />
      <AppShell
        user={user}
        activeRole="super_admin"
        sections={SUPER_ADMIN_SECTIONS}
        roleLabel={ROLE_LABELS.super_admin}
        showNavPrefs={false}
      >
        {children}
      </AppShell>
    </>
  );
}
