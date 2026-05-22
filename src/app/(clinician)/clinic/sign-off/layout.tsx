import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { SignOffNav, type NavSection } from "./sign-off-nav";

export default async function SignOffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const [
    labTotal,
    labUrgent,
    refillTotal,
    refillUrgent,
    noteTotal,
    noteUrgent,
    msgTotal,
  ] = await Promise.all([
    prisma.labResult.count({ where: { organizationId: orgId, signedAt: null } }),
    prisma.labResult.count({ where: { organizationId: orgId, signedAt: null, abnormalFlag: true } }),
    prisma.refillRequest.count({
      where: { organizationId: orgId, signedAt: null, status: { in: ["new", "flagged"] } },
    }),
    prisma.refillRequest.count({
      where: { organizationId: orgId, signedAt: null, status: "flagged" },
    }),
    prisma.note.count({
      where: { status: "needs_review", encounter: { patient: { organizationId: orgId } } },
    }),
    prisma.note.count({
      where: {
        status: "needs_review",
        aiConfidence: { lt: 0.6 },
        encounter: { patient: { organizationId: orgId } },
      },
    }),
    prisma.message.count({
      where: { status: "draft", aiDrafted: true, thread: { patient: { organizationId: orgId } } },
    }),
  ]);

  const total = labTotal + refillTotal + noteTotal + msgTotal;

  const sections: NavSection[] = [
    {
      label: "All items",
      href: "/clinic/sign-off",
      count: total,
      hasUrgent: labUrgent > 0 || refillUrgent > 0 || noteUrgent > 0,
    },
    {
      label: "Labs",
      href: "/clinic/sign-off/labs",
      count: labTotal,
      hasUrgent: labUrgent > 0,
    },
    {
      label: "Refills",
      href: "/clinic/sign-off/refills",
      count: refillTotal,
      hasUrgent: refillUrgent > 0,
    },
    {
      label: "Clinical notes",
      href: "/clinic/sign-off/notes",
      count: noteTotal,
      hasUrgent: noteUrgent > 0,
    },
    {
      label: "Messages",
      href: "/clinic/sign-off/messages",
      count: msgTotal,
      hasUrgent: false,
    },
  ];

  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)]">
      {/* Left sidebar — Sign-Off tree navigation */}
      <div className="w-56 shrink-0 border-r border-border bg-surface flex flex-col p-3">
        <p className="text-[11px] font-semibold text-text-subtle uppercase tracking-[0.12em] mb-3 px-2">
          Sign-off
        </p>
        <SignOffNav sections={sections} />
      </div>

      {/* Right content */}
      <div className="flex-1 min-w-0 bg-surface-raised overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
