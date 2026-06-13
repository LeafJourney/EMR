import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
import { AppShell, type NavSection } from "@/components/shell/AppShell";
import { SplitWorkspace } from "@/components/shell/SplitWorkspace";
import { ContextPane } from "@/components/shell/ContextPane";
import { homeForRoles } from "@/lib/rbac/roles";
import { QuoteWelcomeModal } from "@/components/ui/quote-of-the-day";
import { BreathingBreak } from "@/components/clinical/BreathingBreak";
import { KeyboardShortcuts } from "@/components/ui/keyboard-shortcuts";
import { CommandPalette } from "@/components/ui/command-palette";
import { GlobalSearchButton } from "@/components/ui/global-search-button";
import { ConsciousnessOverlay } from "@/components/ui/consciousness-overlay";
import { ClinicianTour } from "@/components/onboarding/clinician-tour";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { HelpDrawer } from "@/components/help/help-drawer";
import { RecentPatientsStrip } from "@/components/patient/recent-patients-strip";
import { SystemBannerRail } from "@/components/ui/system-banner";
import { prisma } from "@/lib/db/prisma";
import {
  computeApprovalsBadge,
  computeLabsBadge,
  computeRefillsBadge,
} from "@/lib/domain/nav-badges";
import {
  getActiveAgentActivity,
  indexActivityByHref,
} from "@/lib/domain/nav-agent-activity";
import { logger } from "@/lib/observability/log";

export default async function ClinicianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // The first-run clinician tour is great for a brand-new provider, but it
  // hijacks the screen on demo / showcase logins (e.g. clinician@demo.health)
  // where we're demonstrating the *physician workflow*, not onboarding.
  // Suppress the auto-trigger for those accounts; manual replay still works.
  const isDemoSurface = /@demo\.health$/i.test(user.email);

  const CLINIC_FLOOR_ROLES: Array<typeof user.roles[number]> = [
    "clinician",
    "midlevel",
    "back_office",
    "front_office",
    "practice_owner",
  ];

  if (!user.roles.some((r) => CLINIC_FLOOR_ROLES.includes(r))) {
    redirect(homeForRoles(user.roles));
  }

  const safeCount = async (fn: () => Promise<number>) => {
    try {
      return await fn();
    } catch (err) {
      logger.error({ event: "clinician.layout.count_failed", err });
      return 0;
    }
  };

  const activityIndex = indexActivityByHref(
    user.organizationId
      ? await getActiveAgentActivity(user.organizationId)
      : [],
  );

  const [
    pendingCount,
    emergencyCount,
    labsPendingCount,
    labsAbnormalCount,
    refillsPendingCount,
  ] = await (async () => {
    const orgId = user.organizationId;
    if (!orgId) return [0, 0, 0, 0, 0] as const;
    return Promise.all([
      safeCount(() =>
        prisma.message.count({
          where: {
            status: "draft",
            aiDrafted: true,
            thread: { patient: { organizationId: orgId } },
          },
        })
      ),
      safeCount(() =>
        prisma.message.count({
          where: {
            status: "draft",
            aiDrafted: true,
            thread: {
              triageUrgency: "emergency",
              patient: { organizationId: orgId },
            },
          },
        })
      ),
      safeCount(() =>
        prisma.labResult.count({
          where: { organizationId: orgId, signedAt: null },
        })
      ),
      safeCount(() =>
        prisma.labResult.count({
          where: { organizationId: orgId, signedAt: null, abnormalFlag: true },
        })
      ),
      safeCount(() =>
        prisma.refillRequest.count({
          where: {
            organizationId: orgId,
            status: { in: ["new", "flagged"] },
            signedAt: null,
          },
        })
      ),
    ]);
  })();

  const sections: NavSection[] = [
    {
      label: "Today",
      pillar: "today",
      icon: "clipboard-check",
      items: [
        { label: "Overview", href: "/clinic" },
        { label: "Command Center", href: "/clinic/command" },
        { label: "Schedule", href: "/clinic/schedule" },
        { label: "Telehealth", href: "/telehealth" },
      ],
    },
    {
      label: "Patients",
      pillar: "patients",
      icon: "users",
      items: [
        { label: "Roster", href: "/clinic/patients" },
      ],
    },
    {
      label: "Inbox",
      pillar: "inbox",
      icon: "inbox",
      items: [
        { label: "Messages", href: "/clinic/messages" },
        // EMR-165: unified sign-off queue rolls up labs + refills +
        // notes + messages — clinician's single place to clear the day.
        {
          label: "Sign-off",
          href: "/clinic/sign-off",
          badge: computeApprovalsBadge({ pendingCount, emergencyCount }) // Or a combined badge
        },
        // EMR-915: kiosk→phone lobby intake/consent waiting to be accepted into the chart.
        { label: "Lobby submissions", href: "/clinic/lobby-submissions" },
      ],
    },
    {
      label: "Reference",
      pillar: "reference",
      icon: "book-open",
      items: [
        { label: "Providers", href: "/clinic/providers" },
        { label: "Research", href: "/clinic/research" },
        { label: "Library", href: "/clinic/library" },
        { label: "Communications", href: "/clinic/communications" },
      ],
    },
    {
      label: "Admin",
      pillar: "admin",
      icon: "settings",
      items: [
        { label: "Audit", href: "/clinic/audit-trail" },
        { label: "Brief", href: "/clinic/morning-brief" },
      ],
    },
  ];

  for (const section of sections) {
    for (const item of section.items) {
      const hit = activityIndex[item.href];
      if (hit) item.activity = hit;
    }
  }

  return (
    <>
      {/* System-wide banners (status / maintenance / announcements).
          Mounted above AppShell so the sticky-top banner spans the
          viewport rather than being clipped by the role rail / drawer. */}
      <SystemBannerRail surface="clinician" />
      <AppShell
      user={user}
      activeRole="clinician"
      sections={sections}
      roleLabel="Provider"
      showNavPrefs={false}
    >
      <QuoteWelcomeModal userName={user.firstName} />
      <BreathingBreak />
      <KeyboardShortcuts />
      <CommandPalette role="clinician" userId={user.id} />
      <GlobalSearchButton />
      <ConsciousnessOverlay />
      <ClinicianTour autoStart={!isDemoSurface} />
      <InstallPrompt />
      <HelpDrawer />
      <RecentPatientsStrip userId={user.id} />
      <SplitWorkspace>
        <ContextPane />
        {children}
      </SplitWorkspace>
    </AppShell>
    </>
  );
}
