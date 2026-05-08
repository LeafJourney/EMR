import React from "react";
import { Activity, Pill, Moon } from "lucide-react";

export interface HealthRingsProps {
  move: { value: number; max: number };
  meds: { value: number; max: number };
  sleep: { value: number; max: number };
}

/**
 * Health Rings Gamification Component (EMR-023)
 * Displays Apple-Watch-style concentric progress rings for patient adherence.
 */
export function HealthRings({ rings }: { rings?: HealthRingsProps }) {
  const defaultRings = {
    move: { value: 30, max: 45 },
    meds: { value: 2, max: 3 },
    sleep: { value: 6.5, max: 8 },
  };

  const data = rings || defaultRings;

  // Calculate percentages (capped at 100%)
  const movePct = Math.min((data.move.value / data.move.max) * 100, 100);
  const medsPct = Math.min((data.meds.value / data.meds.max) * 100, 100);
  const sleepPct = Math.min((data.sleep.value / data.sleep.max) * 100, 100);

  // SVG dimensions
  const size = 180;
  const center = size / 2;
  const strokeWidth = 14;
  
  // Radii
  const moveRadius = 75;
  const medsRadius = 55;
  const sleepRadius = 35;

  // Circumferences
  const moveCircumference = 2 * Math.PI * moveRadius;
  const medsCircumference = 2 * Math.PI * medsRadius;
  const sleepCircumference = 2 * Math.PI * sleepRadius;

  return (
    <div className="bg-black border border-neutral-800 rounded-3xl p-6 flex flex-col items-center shadow-xl">
      <h3 className="text-white font-semibold text-sm mb-6 uppercase tracking-widest opacity-80">
        Daily Activity
      </h3>
      
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background Rings */}
          <circle cx={center} cy={center} r={moveRadius} stroke="#f43f5e" strokeWidth={strokeWidth} fill="none" className="opacity-20" />
          <circle cx={center} cy={center} r={medsRadius} stroke="#10b981" strokeWidth={strokeWidth} fill="none" className="opacity-20" />
          <circle cx={center} cy={center} r={sleepRadius} stroke="#3b82f6" strokeWidth={strokeWidth} fill="none" className="opacity-20" />
          
          {/* Progress Rings */}
          <circle 
            cx={center} cy={center} r={moveRadius} 
            stroke="#f43f5e" strokeWidth={strokeWidth} fill="none" 
            strokeLinecap="round"
            strokeDasharray={moveCircumference}
            strokeDashoffset={moveCircumference - (movePct / 100) * moveCircumference}
            className="transition-all duration-1000 ease-out drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]"
          />
          <circle 
            cx={center} cy={center} r={medsRadius} 
            stroke="#10b981" strokeWidth={strokeWidth} fill="none" 
            strokeLinecap="round"
            strokeDasharray={medsCircumference}
            strokeDashoffset={medsCircumference - (medsPct / 100) * medsCircumference}
            className="transition-all duration-1000 ease-out drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]"
          />
          <circle 
            cx={center} cy={center} r={sleepRadius} 
            stroke="#3b82f6" strokeWidth={strokeWidth} fill="none" 
            strokeLinecap="round"
            strokeDasharray={sleepCircumference}
            strokeDashoffset={sleepCircumference - (sleepPct / 100) * sleepCircumference}
            className="transition-all duration-1000 ease-out drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]"
          />
        </svg>
        
        {/* Icons inside the empty space if we wanted them, but Apple style usually puts them at the tip of the ring. For simplicity we'll just show them in the legend below. */}
      </div>

      {/* Legend */}
      <div className="w-full mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <div className="w-6 h-6 rounded-full bg-rose-500/20 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-rose-500" />
            </div>
            <span className="text-sm font-medium">Move</span>
          </div>
          <div className="text-right">
            <span className="text-rose-500 font-bold">{data.move.value}</span>
            <span className="text-neutral-500 text-xs ml-1">/ {data.move.max} min</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Pill className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <span className="text-sm font-medium">Meds</span>
          </div>
          <div className="text-right">
            <span className="text-emerald-500 font-bold">{data.meds.value}</span>
            <span className="text-neutral-500 text-xs ml-1">/ {data.meds.max} doses</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Moon className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <span className="text-sm font-medium">Sleep</span>
          </div>
          <div className="text-right">
            <span className="text-blue-500 font-bold">{data.sleep.value}</span>
            <span className="text-neutral-500 text-xs ml-1">/ {data.sleep.max} hr</span>
          </div>
        </div>
      </div>
    </div>
  );
}
