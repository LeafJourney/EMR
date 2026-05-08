import React from "react";
import { Moon, Clock, Bed, Coffee, CheckCircle2, Circle } from "lucide-react";

export interface SleepTask {
  id: string;
  title: string;
  isCompleted: boolean;
  time?: string;
}

export function SleepHygieneCard({ tasks = [] }: { tasks?: SleepTask[] }) {
  const defaultTasks: SleepTask[] = [
    { id: "s1", title: "Stop caffeine intake", time: "2:00 PM", isCompleted: true },
    { id: "s2", title: "Dim screens & lights", time: "8:00 PM", isCompleted: false },
    { id: "s3", title: "Take evening CBN dose", time: "9:00 PM", isCompleted: false },
    { id: "s4", title: "In bed, lights out", time: "10:00 PM", isCompleted: false },
  ];

  const displayTasks = tasks.length > 0 ? tasks : defaultTasks;

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-indigo-50 dark:bg-indigo-900/20 px-6 py-5 border-b border-indigo-100 dark:border-indigo-900/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-indigo-100 dark:bg-indigo-800 p-2 rounded-xl">
            <Moon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h2 className="text-xl font-bold text-indigo-900 dark:text-indigo-100">
            Sleep Hygiene
          </h2>
        </div>
        <p className="text-sm text-indigo-700 dark:text-indigo-400">
          Optimize your circadian rhythm to maximize the restorative effects of your therapy.
        </p>
      </div>

      <div className="p-6">
        <div className="flex flex-col gap-4">
          {displayTasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between p-3 rounded-xl border border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
              <div className="flex items-center gap-3">
                {task.isCompleted ? (
                  <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                ) : (
                  <Circle className="w-5 h-5 text-neutral-300 dark:text-neutral-600 cursor-pointer hover:text-indigo-400 transition-colors" />
                )}
                <span className={`text-sm font-medium ${task.isCompleted ? 'text-neutral-500 line-through' : 'text-neutral-900 dark:text-neutral-100'}`}>
                  {task.title}
                </span>
              </div>
              {task.time && (
                <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded-md font-medium">
                  <Clock className="w-3.5 h-3.5" />
                  {task.time}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
