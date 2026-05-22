import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { ClaimsWorkbench } from "@/components/leafnerd/ClaimsWorkbench";
import Link from "next/link";

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

  // Fetch anomalies along with their claims details to display in the workbench
  const anomalies = await prisma.claimScrubResult.findMany({
    include: {
      claim: true
    },
    orderBy: {
      scrubbedAt: 'desc'
    }
  });

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
