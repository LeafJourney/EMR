import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { ClaimsWorkbench } from "@/components/leafnerd/ClaimsWorkbench";
import Link from "next/link";

type ScrubWithClaim = Prisma.ClaimScrubResultGetPayload<{ include: { claim: true } }>;

export default async function ClaimsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // 2. Permission gate
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id }
  });
  const hasAccess = memberships.some((m: { role: string }) => m.role === 'leafnerd' || m.role === 'super_admin');
  if (!hasAccess) {
    redirect("/leafnerd");
  }

  // Resolve the demo org so the workbench is scoped to a single tenant — mirrors
  // the live SPA page.tsx, which scopes its claims overlay to the demo org and
  // never aggregates across tenants. On any failure we fall back to no org id
  // (and therefore no anomalies) rather than leaking other tenants' claims.
  let demoOrgId: string | null = null;
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: "leafnerd-demo" },
      select: { id: true }
    });
    demoOrgId = org?.id ?? null;
  } catch {
    demoOrgId = null;
  }

  // Fetch anomalies along with their claims details to display in the workbench.
  // Scoped to the demo org and filtered to genuinely-flagged statuses (warnings /
  // blocked) so clean scrubs don't inflate the flagged count or block the
  // "All anomalies resolved" empty state. Wrapped in try/catch with an
  // empty-array fallback so a DB error renders the empty state, not a 500.
  let anomalies: ScrubWithClaim[] = [];
  if (demoOrgId) {
    try {
      anomalies = await prisma.claimScrubResult.findMany({
        where: {
          status: { in: ['warnings', 'blocked'] },
          claim: { is: { organizationId: demoOrgId } }
        },
        include: {
          claim: true
        },
        orderBy: {
          scrubbedAt: 'desc'
        },
        take: 25
      });
    } catch {
      anomalies = [];
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="border-b border-border/10 pb-6">
        <Link href="/leafnerd" className="text-sm font-bold text-accent-strong hover:underline mb-2 inline-block">← Back to Dashboard</Link>
        <h2 className="text-3xl font-bold text-text-strong tracking-tight">Claims Auditor</h2>
        <p className="text-text-muted mt-2 font-medium">Scrub billing claims for CPT code errors and compliance warnings.</p>
      </header>

      <ClaimsWorkbench initialAnomalies={anomalies} />
    </div>
  );
}
