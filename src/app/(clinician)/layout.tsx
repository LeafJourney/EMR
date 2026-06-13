import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
import { AppShell, type NavSection } from "@/components/shell/AppShell";
import { SplitWorkspace } from "@/components/shell/SplitWorkspace";
import { ContextPane } from "@/components/shell/ContextPane";
import { homeForRoles } from "@/lib/rbac/roles";
import { hasPermission } from "@/lib/rbac/permissions";
import { QuoteWelcomeModal } from "@/components/ui/quote-of-the-day";
import { BreathingBreak } from "@/components/clinical/BreathingBreak";
import { KeyboardShortcuts } from "@/components/ui/keyboard-shortcuts";
import { CommandPalette } from "@/components/ui/command-palette";
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

  // EMR-1111 (FO-M8) — role-aware navigation. The nav is no longer
  // role-blind: clinical surfaces (sign-off, command center, telehealth,
  // brief, audit) are hidden from roles without the matching permission,
  // and the desk worklist entries (Tasks, Front desk) are shown to the
  // staff roles that work them.
  const canReadNotes = hasPermission(user, "notes.read");
  const canEditNotes = hasPermission(user, "notes.edit");
  const DESK_WORKLIST_ROLES: Array<(typeof user.roles)[number]> = [
    "front_office",
    "back_office",
    "clinician",
    "practice_owner",
  ];
  const canSeeDeskWorklists = user.roles.some((r) =>
    DESK_WORKLIST_ROLES.includes(r),
  );
  // The front-desk board's page guard mirrors QUEUE_STATE_ROLES, which
  // excludes clinician/midlevel — the nav must match or the link bounces.
  const FRONT_DESK_ROLES: Array<(typeof user.roles)[number]> = [
    "front_office",
    "back_office",
    "practice_owner",
  ];
  const canSeeFrontDesk = user.roles.some((r) => FRONT_DESK_ROLES.includes(r));

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
    notesPendingCount,
  ] = await (async () => {
    const orgId = user.organizationId;
    // The sign-off badge counts are clinical workload signals — skip the
    // queries entirely for roles that can't see the sign-off queue.
    if (!orgId || !canReadNotes) return [0, 0, 0, 0, 0, 0] as const;
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
      // Notes awaiting signature — completes the sign-off rollup so the
      // Inbox-rail badge matches the /clinic/sign-off hub total. Query must
      // mirror sign-off/layout.tsx (noteTotal).
      safeCount(() =>
        prisma.note.count({
          where: {
            status: "needs_review",
            encounter: { patient: { organizationId: orgId } },
          },
        })
      ),
    ]);
  })();

  // Unified sign-off rollup (AI-drafted messages + labs + refills + notes) so
  // the Inbox-rail "Sign-off" badge matches the /clinic/sign-off hub's "All
  // items" total. Passing pendingCount (messages only) under-counted it.
  const signOffPending =
    pendingCount + labsPendingCount + refillsPendingCount + notesPendingCount;

  const sections: NavSection[] = [
    {
      label: "Today",
      pillar: "today",
      icon: "clipboard-check",
      items: [
        { label: "Overview", href: "/clinic" },
        // Command center is built around clinical counters/drafts.
        ...(canReadNotes
          ? [{ label: "Command Center", href: "/clinic/command" }]
          : []),
        { label: "Schedule", href: "/clinic/schedule" },
        // Telehealth visits are conducted by providers (notes.edit roles).
        ...(canEditNotes ? [{ label: "Telehealth", href: "/telehealth" }] : []),
        // EMR-1111 (FO-B1): clinic-side task worklist + front-desk board —
        // visible to the staff roles that work them.
        ...(canSeeDeskWorklists ? [{ label: "Tasks", href: "/clinic/tasks" }] : []),
        ...(canSeeFrontDesk
          ? [{ label: "Front desk", href: "/clinic/front-desk" }]
          : []),
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
        ...(canReadNotes
          ? [
              // EMR-165: unified sign-off queue rolls up labs + refills +
              // notes + messages — clinician's single place to clear the day.
              {
                label: "Sign-off",
                href: "/clinic/sign-off",
                badge: computeApprovalsBadge({ pendingCount: signOffPending, emergencyCount }),
              },
              // EMR-915: kiosk→phone lobby intake/consent waiting to be accepted into the chart.
              { label: "Lobby submissions", href: "/clinic/lobby-submissions" },
            ]
          : []),
      ],
    },
    {
      label: "Reference",
      pillar: "reference",
      icon: "book-open",
      items: [
        ...(canReadNotes
          ? [
              { label: "Providers", href: "/clinic/providers" },
              { label: "Research", href: "/clinic/research" },
              { label: "Library", href: "/clinic/library" },
            ]
          : []),
        { label: "Communications", href: "/clinic/communications" },
      ],
    },
    // Admin (audit trail + clinical brief) is clinical/leadership surface.
    ...(canReadNotes
      ? [
          {
            label: "Admin",
            pillar: "admin",
            icon: "settings",
            items: [
              { label: "Audit", href: "/clinic/audit-trail" },
              { label: "Brief", href: "/clinic/morning-brief" },
            ],
          } satisfies NavSection,
        ]
      : []),
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
