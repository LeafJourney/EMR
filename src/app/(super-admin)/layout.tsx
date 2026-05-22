import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { bootstrapSuperAdminIfAllowlisted } from "@/lib/auth/super-admin-bootstrap";
import { AppShell, type NavSection } from "@/components/shell/AppShell";
import { ImpersonationBanner } from "@/components/super-admin/impersonation-banner";
import { ROLE_LABELS } from "@/lib/rbac/roles";

export const dynamic = "force-dynamic";

// Four rail pillars, each with multiple destinations so the drawer reads
// as a real workspace map rather than one-link rooms. PillarNav returns
// the FIRST section whose pillar key matches the active rail icon, so
// sharing a pillar key across sections silently hides every section
// after the first — every pillar here is unique.
//
//   HQ          — KPI / dashboard read surface (chart)
//   Operations  — what a super-admin does all day (building)
//   Audit       — observability + the audit log (inbox)
//   Security    — hardening / MFA / revoke / bootstrap (shield)
const SUPER_ADMIN_SECTIONS: NavSection[] = [
  {
    pillar: "hq",
    icon: "chart",
    label: "HQ",
    items: [
      { label: "Dashboard", href: "/admin/hq" },
      { label: "Leaderboards", href: "/admin/hq#leaderboards-heading" },
      { label: "24h activity", href: "/admin/hq#activity-heading" },
    ],
  },
  {
    pillar: "operations",
    icon: "building",
    label: "Operations",
    items: [
      { label: "Practices", href: "/practices" },
      { label: "Onboarding", href: "/onboarding" },
      { label: "Templates", href: "/templates" },
      { label: "Cross-tenant search", href: "/admin/search" },
    ],
  },
  {
    pillar: "audit",
    icon: "inbox",
    label: "Audit",
    items: [
      { label: "Audit log", href: "/admin/audit" },
      { label: "Audit export (CSV)", href: "/api/admin/audit/export" },
    ],
  },
  {
    pillar: "security",
    icon: "shield",
    label: "Security",
    items: [
      { label: "Super-admin console", href: "/admin/console" },
      { label: "Bootstrap allowlist", href: "/admin/bootstrap" },
    ],
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
