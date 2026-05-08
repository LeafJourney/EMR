import React from "react";
import { Sparkles, RefreshCcw, Info } from "lucide-react";

/**
 * Combo Wheel Shell Component (EMR-001)
 * A visually vibrant placeholder for the upcoming Interactive Cannabis Combo Wheel.
 */
export function ComboWheelShell() {
  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl p-8 relative flex flex-col items-center justify-center min-h-[500px]">
      
      {/* Decorative ambient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-emerald-500/10 rounded-full mix-blend-screen filter blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full mix-blend-screen filter blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 border border-neutral-800/50 rounded-full"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-neutral-800/30 rounded-full border-dashed"></div>
      </div>

      {/* Central Wheel Mockup */}
      <div className="relative z-10 w-64 h-64 mb-8">
        {/* Animated outer ring */}
        <div className="absolute inset-0 rounded-full border-[12px] border-neutral-900 border-t-emerald-500 border-r-purple-500 border-b-rose-500 border-l-blue-500 animate-[spin_10s_linear_infinite] opacity-80"></div>
        
        {/* Inner static ring */}
        <div className="absolute inset-4 rounded-full border-2 border-neutral-800 bg-neutral-950/50 backdrop-blur-sm flex items-center justify-center flex-col shadow-inner">
          <Sparkles className="w-8 h-8 text-emerald-400 mb-2" />
          <span className="font-bold text-white tracking-widest uppercase text-sm">Wheel</span>
          <span className="text-[10px] text-neutral-500 tracking-widest mt-1">COMING SOON</span>
        </div>
      </div>

      <div className="relative z-10 text-center max-w-sm">
        <h2 className="text-2xl font-bold text-white mb-3">
          Interactive Combo Wheel
        </h2>
        <p className="text-sm text-neutral-400 leading-relaxed mb-6">
          The Verdant Apothecary Combo Wheel (EMR-001) will allow patients to explore cannabinoids and terpenes dynamically. Integration pending Phase 2.
        </p>
        
        <div className="flex items-center justify-center gap-3">
          <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-all">
            <RefreshCcw className="w-4 h-4" />
            Simulate Spin
          </button>
          <button className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-all">
            <Info className="w-4 h-4" />
            Learn More
          </button>
        </div>
      </div>
      
    </div>
  );
}
