import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { CohortSimulator } from "@/components/leafnerd/CohortSimulator";
import Link from "next/link";

export default async function CohortsPage() {
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
  
  const statusCounts = await prisma.patient.groupBy({
    by: ['status'],
    _count: true
  });
  
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="border-b border-border/10 pb-6">
        <Link href="/leafnerd" className="text-sm font-bold text-accent-strong hover:underline mb-2 inline-block">← Back to Dashboard</Link>
        <h2 className="text-3xl font-bold text-text-strong tracking-tight">Cohort Simulation</h2>
        <p className="text-text-muted mt-2 font-medium">Model treatment efficacy across synthetic profiles.</p>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {statusCounts.map(sc => (
          <div key={sc.status} className="bg-bg-surface border border-border/10 rounded-xl p-6 shadow-sm">
            <h4 className="text-sm font-bold text-text-muted uppercase tracking-wider">{sc.status}</h4>
            <div className="text-3xl font-black text-text-strong mt-2">{sc._count}</div>
          </div>
        ))}
      </div>

      <CohortSimulator statusCounts={statusCounts} />
    </div>
  );
}

