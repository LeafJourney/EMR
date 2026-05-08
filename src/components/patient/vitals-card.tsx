import React from "react";
import { Heart, Activity, Thermometer, Wind, Droplets } from "lucide-react";

export interface VitalsProps {
  heartRate: number;
  bloodPressureSys: number;
  bloodPressureDia: number;
  temperature: number;
  respiratoryRate: number;
  oxygenSaturation: number;
  lastUpdated: string;
}

/**
 * Vitals Card (EMR-011)
 * Displays patient vitals using warmer, human-centric wording.
 */
export function VitalsCard({ vitals }: { vitals?: VitalsProps }) {
  if (!vitals) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 text-center">
        <p className="text-neutral-500 dark:text-neutral-400 italic">
          We haven't recorded your wellness signals yet today.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-emerald-100 dark:border-emerald-900/30 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="bg-emerald-50 dark:bg-emerald-900/20 px-5 py-4 border-b border-emerald-100 dark:border-emerald-900/30 flex justify-between items-center">
        <h3 className="font-medium text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
          <Heart className="w-5 h-5 text-rose-500" />
          Body Wellness Signals
        </h3>
        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          Checked {vitals.lastUpdated}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-5">
        <div className="flex flex-col gap-1 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
          <span className="text-xs text-neutral-500 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Heart Rhythm
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold text-neutral-800 dark:text-neutral-100">
              {vitals.heartRate}
            </span>
            <span className="text-xs text-neutral-500">beats/min</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
          <span className="text-xs text-neutral-500 flex items-center gap-1.5">
            <Droplets className="w-3.5 h-3.5" /> Circulation Flow
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold text-neutral-800 dark:text-neutral-100">
              {vitals.bloodPressureSys}/{vitals.bloodPressureDia}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
          <span className="text-xs text-neutral-500 flex items-center gap-1.5">
            <Wind className="w-3.5 h-3.5" /> Breathing Pace
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold text-neutral-800 dark:text-neutral-100">
              {vitals.respiratoryRate}
            </span>
            <span className="text-xs text-neutral-500">breaths/min</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
          <span className="text-xs text-neutral-500 flex items-center gap-1.5">
            <Wind className="w-3.5 h-3.5 text-blue-500" /> Blood Oxygen
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold text-neutral-800 dark:text-neutral-100">
              {vitals.oxygenSaturation}%
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
          <span className="text-xs text-neutral-500 flex items-center gap-1.5">
            <Thermometer className="w-3.5 h-3.5 text-orange-500" /> Body Warmth
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold text-neutral-800 dark:text-neutral-100">
              {vitals.temperature}°F
            </span>
          </div>
        </div>
      </div>
      
      <div className="px-5 py-3 bg-neutral-50 dark:bg-neutral-800/30 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 text-center">
        These signals help us understand how your body is feeling right now.
      </div>
    </div>
  );
}
