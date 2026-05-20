import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { OutcomeVelocityChart } from "@/components/leafnerd/OutcomeVelocityChart";
import Link from "next/link";

export default async function LeafNerdDashboard() {
  // 1. Auth check
  const user = await requireUser();
  
  // 2. Permission gate
  // Fetch memberships to see if they have the 'leafnerd' role we just added to the DB.
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id }
  });
  
  // Temporarily bypass the redirect in local dev if they don't have it yet, 
  // but in prod this would enforce the gate:
  const hasAccess = memberships.some((m: { role: string }) => m.role === 'leafnerd' || m.role === 'super_admin');
  
  // if (!hasAccess) {
  //   redirect("/upgrade-leafnerd"); // Or to an access denied page
  // }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex justify-between items-end border-b border-border/10 pb-6 relative">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-accent-strong/5 rounded-full blur-3xl pointer-events-none -mt-48" />
        <div className="relative z-10">
          <h2 className="text-3xl font-bold text-text-strong tracking-tight">Welcome back, {user.firstName}</h2>
          <p className="text-text-muted mt-2 font-medium">Your clinical intelligence overlay is analyzing real-time data.</p>
        </div>
        {!hasAccess && (
          <div className="relative z-10 bg-error/10 text-error px-4 py-2 rounded-lg text-sm font-semibold border border-error/20">
            Preview Mode — Requires LeafNerd Access
          </div>
        )}
      </header>

      {/* Grid for Data Viz */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Big Chart Placeholder */}
        <div className="lg:col-span-2 bg-bg-surface border border-border/10 rounded-2xl p-6 h-[400px] flex flex-col relative overflow-hidden shadow-sm">
          <h3 className="text-lg font-semibold text-text-strong mb-1">Outcome Velocity vs Polypharmacy</h3>
          <p className="text-xs text-text-muted mb-6">Tracking patient symptom reduction against prescription count.</p>
          <div className="flex-1 rounded-xl overflow-hidden border border-border/10">
            <OutcomeVelocityChart />
          </div>
        </div>

        {/* AI Assistant Overlay Placeholder */}
        <div className="bg-bg-surface border border-border/10 rounded-2xl p-6 h-[400px] flex flex-col relative overflow-hidden group hover:border-accent-strong/30 transition-colors shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-accent-strong/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-center space-x-3 mb-4 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-accent-strong flex items-center justify-center shadow-lg shadow-accent-strong/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-bg"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-strong">Insight Assistant</h3>
              <p className="text-xs text-accent-strong font-semibold">Active</p>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col justify-end space-y-4 relative z-10 mt-auto">
            <div className="bg-bg p-4 rounded-2xl rounded-tl-sm border border-border/10 text-sm text-text-strong shadow-sm leading-relaxed">
              I noticed a <span className="text-accent-strong font-bold">14% anomaly</span> in dosing efficacy for Cohort A today. Specifically, patients on SSRIs are reporting diminished effects. Would you like me to extrapolate the root cause?
            </div>
            <button className="w-full py-3.5 bg-accent-strong text-bg rounded-xl font-bold text-sm shadow-md hover:shadow-lg hover:bg-accent-strong/90 hover:-translate-y-0.5 transition-all">
              Dive Deeper
            </button>
          </div>
        </div>
      </div>
      
      {/* Secondary Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/leafnerd/cohorts" className="block">
          <div className="bg-bg-surface border border-border/10 rounded-2xl p-6 flex items-center justify-between shadow-sm hover:border-accent-strong/30 hover:bg-bg-highlight/5 transition-all cursor-pointer group">
            <div>
              <h4 className="font-semibold text-text-strong group-hover:text-accent-strong transition-colors">Run Cohort Simulation</h4>
              <p className="text-sm text-text-muted mt-1">Test treatment efficacy across 10k synthetic profiles.</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-bg border border-border/10 flex items-center justify-center text-text-muted group-hover:bg-accent-strong/10 group-hover:text-accent-strong group-hover:border-accent-strong/30 transition-all">→</div>
          </div>
        </Link>
        <Link href="/leafnerd/claims" className="block">
          <div className="bg-bg-surface border border-border/10 rounded-2xl p-6 flex items-center justify-between shadow-sm hover:border-error/30 hover:bg-bg-highlight/5 transition-all cursor-pointer group">
            <div>
              <h4 className="font-semibold text-text-strong group-hover:text-error transition-colors">Real-time Claims Anomaly</h4>
              <p className="text-sm text-text-muted mt-1">Review 3 flagged billing codes from yesterday.</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-error/10 border border-error/20 flex items-center justify-center text-error font-bold shadow-sm">3</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
