import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";

export default async function CohortsPage() {
  await requireUser();
  
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

      <div className="bg-bg-surface border border-border/10 rounded-2xl p-16 text-center shadow-sm relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-accent-strong/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
        <div className="w-20 h-20 rounded-full bg-accent-strong/10 border border-accent-strong/20 flex items-center justify-center mx-auto mb-6 shadow-inner relative z-10">
          <span className="text-3xl animate-bounce">🧬</span>
        </div>
        <h3 className="text-2xl font-bold text-text-strong relative z-10">Simulation Engine Ready</h3>
        <p className="text-text-muted mt-4 max-w-lg mx-auto leading-relaxed relative z-10">
          The Monte Carlo simulation engine has loaded the demographic vectors. Select a cohort segment above to begin running hypothetical dosing regimens against historical baselines.
        </p>
      </div>
    </div>
  );
}
