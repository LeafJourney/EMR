import React from "react";
import { Activity, Dumbbell, Footprints, Wind } from "lucide-react";

export function ExerciseRegimenCard() {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-rose-50 dark:bg-rose-900/20 px-6 py-5 border-b border-rose-100 dark:border-rose-900/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-rose-100 dark:bg-rose-800 p-2 rounded-xl">
            <Activity className="w-5 h-5 text-rose-600 dark:text-rose-400" />
          </div>
          <h2 className="text-xl font-bold text-rose-900 dark:text-rose-100">
            Movement & Exercise
          </h2>
        </div>
        <p className="text-sm text-rose-700 dark:text-rose-400">
          Moderate exercise naturally stimulates anandamide production (the "runner's high").
        </p>
      </div>

      <div className="p-6">
        <div className="space-y-4">
          <div className="flex gap-4 items-start p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 rounded-xl transition-colors border border-transparent hover:border-neutral-100 dark:hover:border-neutral-800">
            <div className="bg-neutral-100 dark:bg-neutral-800 p-2 rounded-lg shrink-0 mt-1">
              <Footprints className="w-4 h-4 text-rose-500" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">Light Cardio (Daily)</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">20-30 minutes of brisk walking. Recommended timing: 1 hour post-dose if daytime regimen.</p>
            </div>
          </div>

          <div className="flex gap-4 items-start p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 rounded-xl transition-colors border border-transparent hover:border-neutral-100 dark:hover:border-neutral-800">
            <div className="bg-neutral-100 dark:bg-neutral-800 p-2 rounded-lg shrink-0 mt-1">
              <Wind className="w-4 h-4 text-sky-500" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">Mindful Stretching (Evening)</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">10 minutes of yoga or light stretching before bed to relieve physical tension.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
