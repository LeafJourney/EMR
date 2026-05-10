import React from "react";
import { Leaf, Droplets, Sun, Activity } from "lucide-react";

export interface PlantCompanionProps {
  level: number;
  health: number;
  watered: boolean;
  sunlight: number;
}

/**
 * Plant Companion Gamification Component (EMR-022)
 * Visualizes patient adherence through a virtual growing plant.
 */
export function PlantCompanion({ stats }: { stats?: PlantCompanionProps }) {
  const defaultStats = {
    level: 3,
    health: 85,
    watered: true,
    sunlight: 60,
  };

  const currentStats = stats || defaultStats;
  const isHappy = currentStats.health > 70 && currentStats.watered;

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm flex flex-col items-center p-6 text-center">
      <div className="w-full flex justify-between items-start mb-6">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800/50">
          <Leaf className="w-3.5 h-3.5" />
          Level {currentStats.level}
        </div>
        
        <div className="flex gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${currentStats.watered ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-500' : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-400'}`}>
            <Droplets className="w-4 h-4" />
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center border bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-500">
            <Sun className="w-4 h-4" />
          </div>
        </div>
      </div>
      
      {/* Visual Plant Representation */}
      <div className="relative w-32 h-40 flex items-end justify-center mb-6">
        {/* Glow effect */}
        {isHappy && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-emerald-400/20 blur-xl rounded-full mix-blend-screen"></div>
        )}
        
        {/* Abstract Plant Graphic */}
        <div className="relative flex flex-col items-center z-10">
          {/* Leaves */}
          <div className="flex relative top-4">
            <div className={`w-12 h-12 rounded-tl-full rounded-br-full origin-bottom-right rotate-[-30deg] transition-all duration-700 ${isHappy ? 'bg-emerald-500 scale-100' : 'bg-emerald-700/50 scale-90'}`}></div>
            <div className={`w-12 h-12 rounded-tr-full rounded-bl-full origin-bottom-left rotate-[30deg] transition-all duration-700 ${isHappy ? 'bg-emerald-400 scale-100' : 'bg-emerald-600/50 scale-90'}`}></div>
          </div>
          <div className="flex relative -top-2">
            <div className={`w-10 h-10 rounded-tl-full rounded-br-full origin-bottom-right rotate-[-60deg] transition-all duration-700 ${isHappy ? 'bg-emerald-600 scale-100' : 'bg-emerald-800/50 scale-90'}`}></div>
            <div className={`w-10 h-10 rounded-tr-full rounded-bl-full origin-bottom-left rotate-[60deg] transition-all duration-700 ${isHappy ? 'bg-emerald-500 scale-100' : 'bg-emerald-700/50 scale-90'}`}></div>
          </div>
          
          {/* Stem */}
          <div className="w-2.5 h-16 bg-emerald-700 dark:bg-emerald-800 rounded-full mt-1"></div>
          
          {/* Pot */}
          <div className="relative z-20 w-16 h-12 bg-orange-200 dark:bg-orange-900/50 border-t-4 border-orange-300 dark:border-orange-800 rounded-b-xl shadow-inner mt-[-4px]">
            <div className="w-full h-1 bg-black/10"></div>
          </div>
        </div>
      </div>
      
      <h3 className="font-bold text-neutral-900 dark:text-neutral-100">
        Your Wellness Companion
      </h3>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-[200px]">
        {isHappy 
          ? "Your plant is thriving! Keep up your daily check-ins." 
          : "Your plant needs a little attention. Complete today's journal."}
      </p>
      
      {/* Progress Bar */}
      <div className="w-full mt-6">
        <div className="flex justify-between text-xs font-medium mb-1.5">
          <span className="text-neutral-600 dark:text-neutral-400 flex items-center gap-1">
            <Activity className="w-3 h-3 text-emerald-500" />
            Vitality
          </span>
          <span className="text-emerald-600 dark:text-emerald-400">{currentStats.health}%</span>
        </div>
        <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-emerald-500 transition-all duration-1000 ease-out"
            style={{ width: `${currentStats.health}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
