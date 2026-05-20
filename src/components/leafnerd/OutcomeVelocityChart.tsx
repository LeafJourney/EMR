'use client';

export function OutcomeVelocityChart() {
  return (
    <div className="w-full h-full relative overflow-hidden bg-bg-surface/50 rounded-xl flex items-center justify-center p-8">
      <svg className="absolute inset-0 w-full h-full opacity-60 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
        {/* Velocity Trajectory */}
        <path d="M0 90 Q 20 80, 40 50 T 80 20 T 100 10" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-strong" />
        {/* Polypharmacy Baseline */}
        <path d="M0 80 Q 30 70, 50 60 T 100 55" fill="none" stroke="currentColor" strokeWidth="2" className="text-error opacity-70" />
        
        {/* Interactive nodes */}
        <circle cx="40" cy="50" r="2.5" className="fill-accent-strong drop-shadow-md" />
        <circle cx="80" cy="20" r="2.5" className="fill-accent-strong drop-shadow-md" />
        <circle cx="50" cy="60" r="2.5" className="fill-error drop-shadow-md" />
      </svg>
      
      <div className="z-10 bg-bg/90 p-5 rounded-xl shadow-xl border border-border/10 text-center max-w-sm backdrop-blur-md animate-in fade-in zoom-in duration-700">
        <h4 className="font-bold text-text-strong text-sm flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent-strong animate-pulse" />
          Velocity Trajectory Live
        </h4>
        <p className="text-xs text-text-muted mt-2 leading-relaxed">
          Symptom reduction is actively outpacing prescription issuance by <strong className="text-accent-strong">2.4x</strong> across tracked patients in the current window.
        </p>
      </div>
    </div>
  );
}
