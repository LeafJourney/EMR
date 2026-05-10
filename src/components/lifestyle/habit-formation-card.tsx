import React from "react";
import { ListChecks, Flame, Trophy, Milestone } from "lucide-react";

export function HabitFormationCard() {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-violet-50 dark:bg-violet-900/20 px-6 py-5 border-b border-violet-100 dark:border-violet-900/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-violet-100 dark:bg-violet-800 p-2 rounded-xl">
            <ListChecks className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <h2 className="text-xl font-bold text-violet-900 dark:text-violet-100">
            Habit Formation
          </h2>
        </div>
        <p className="text-sm text-violet-700 dark:text-violet-400">
          Consistency is key. Build long-term adherence through small, stackable habits.
        </p>
      </div>

      <div className="p-6">
        <div className="flex items-center justify-between mb-6 p-4 bg-violet-50 dark:bg-violet-900/10 rounded-xl border border-violet-100 dark:border-violet-900/30">
          <div className="flex items-center gap-3">
            <Flame className="w-8 h-8 text-orange-500" />
            <div>
              <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Current Streak</p>
              <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">14 Days</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Next Milestone</p>
              <p className="text-lg font-bold text-violet-600 dark:text-violet-400">21 Days</p>
            </div>
            <Trophy className="w-8 h-8 text-violet-500 opacity-80" />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm flex items-center gap-2 mb-2">
            <Milestone className="w-4 h-4 text-violet-500" />
            Habit Stacking Ideas
          </h3>
          <ul className="list-disc list-inside text-sm text-neutral-600 dark:text-neutral-400 space-y-2">
            <li>Take morning dose immediately after brushing teeth.</li>
            <li>Complete positive journal entry while drinking morning coffee.</li>
            <li>Take evening dose while setting out clothes for tomorrow.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
