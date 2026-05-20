import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";

export default async function ClaimsAnomalyPage() {
  await requireUser();
  
  const anomalies = await prisma.claimScrubResult.findMany({
    where: { status: { in: ['warnings', 'blocked'] } },
    take: 10,
    include: { claim: true },
    orderBy: { scrubbedAt: 'desc' }
  });
  
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="border-b border-border/10 pb-6 flex justify-between items-end">
        <div>
          <Link href="/leafnerd" className="text-sm font-bold text-accent-strong hover:underline mb-2 inline-block">← Back to Dashboard</Link>
          <h2 className="text-3xl font-bold text-text-strong tracking-tight">Claims Anomaly Detection</h2>
          <p className="text-text-muted mt-2 font-medium">Real-time audit of flagged billing codes.</p>
        </div>
        <div className="px-4 py-2 bg-error/10 text-error font-bold rounded-lg text-sm flex items-center gap-2 border border-error/20">
          <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
          {anomalies.length} Flags Detected
        </div>
      </header>
      
      <div className="grid grid-cols-1 gap-4">
        {anomalies.length === 0 ? (
           <div className="text-text-muted text-center py-12">No anomalies detected in the current window.</div>
        ) : anomalies.map((flag) => {
          const edits = Array.isArray(flag.edits) ? flag.edits : [];
          const issue = (edits[0] as any)?.message || "Rule violation detected";
          const cptCodes = flag.claim?.cptCodes as any[];
          const code = cptCodes && cptCodes.length > 0 ? cptCodes[0]?.code : "SYS";
          
          return (
            <div key={flag.id} className="bg-bg-surface border border-border/10 rounded-xl p-6 flex items-center justify-between shadow-sm hover:border-error/30 transition-colors group cursor-pointer">
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 rounded-lg bg-error/10 text-error font-mono font-bold flex items-center justify-center border border-error/20">
                  {code}
                </div>
                <div>
                  <h4 className="font-bold text-text-strong group-hover:text-error transition-colors">{issue}</h4>
                  <p className="text-sm text-text-muted mt-1">Found in claim {flag.claim?.claimNumber || flag.claimId} ({flag.status}).</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-text-strong">AI Scanned</div>
                <div className="text-xs text-text-muted mt-1 hover:underline text-accent-strong">Review Claim →</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
}
