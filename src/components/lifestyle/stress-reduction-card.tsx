import React from "react";
import { Brain, Heart, Wind, Flame } from "lucide-react";

export function StressReductionCard() {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-emerald-50 dark:bg-emerald-900/20 px-6 py-5 border-b border-emerald-100 dark:border-emerald-900/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-emerald-100 dark:bg-emerald-800 p-2 rounded-xl">
            <Brain className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-emerald-900 dark:text-emerald-100">
            Stress Reduction
          </h2>
        </div>
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Chronic cortisol release downregulates CB1 receptors. Managing stress is critical to therapy success.
        </p>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col items-center text-center p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30">
            <Wind className="w-6 h-6 text-emerald-500 mb-2" />
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm mb-1">Box Breathing</h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">4s inhale, 4s hold, 4s exhale, 4s hold. Repeat 5x during acute anxiety.</p>
          </div>
          
          <div className="flex flex-col items-center text-center p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30">
            <Flame className="w-6 h-6 text-amber-500 mb-2" />
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm mb-1">Epsom Salt Bath</h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">Magnesium absorption paired with heat therapy reduces physical tension.</p>
          </div>
          
          <div className="flex flex-col items-center text-center p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30">
            <Heart className="w-6 h-6 text-rose-500 mb-2" />
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm mb-1">Digital Sunset</h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">Turn off all screens 1 hour before bed to lower cognitive load.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
