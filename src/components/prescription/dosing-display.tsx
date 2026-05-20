import React from "react";
import { Pill, AlertCircle, Clock, CheckCircle2 } from "lucide-react";

export interface DoseInfo {
  id: string;
  medication: string;
  amount: string;
  frequency: string;
  timeOfDay: "Morning" | "Afternoon" | "Evening" | "As Needed";
  isTaken?: boolean;
}

/**
 * Dosing Display Component (EMR-003)
 * Clear, patient-friendly visualization of their daily dosing regimen.
 */
export function DosingDisplay({ doses = [] }: { doses?: DoseInfo[] }) {
  const defaultDoses: DoseInfo[] = [
    {
      id: "dose-1",
      medication: "CBD Isolate Tincture",
      amount: "0.25 mL (12.5 mg)",
      frequency: "1x Daily",
      timeOfDay: "Morning",
      isTaken: true,
    },
    {
      id: "dose-2",
      medication: "1:1 THC:CBD Vaporizer",
      amount: "1-2 Inhalations",
      frequency: "As Needed",
      timeOfDay: "As Needed",
      isTaken: false,
    },
    {
      id: "dose-3",
      medication: "CBN Sleep Capsule",
      amount: "1 Capsule (5 mg)",
      frequency: "1x Daily",
      timeOfDay: "Evening",
      isTaken: false,
    },
  ];

  const list = doses.length > 0 ? doses : defaultDoses;

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-6 py-5 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Pill className="w-5 h-5 text-emerald-600" />
            Today's Plan
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Your personalized daily regimen.
          </p>
        </div>
      </div>
      
      <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {list.map((dose) => (
          <div key={dose.id} className="p-5 flex items-start gap-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
            
            <div className={`mt-1 shrink-0 ${dose.isTaken ? 'text-emerald-500' : 'text-neutral-300 dark:text-neutral-600 cursor-pointer hover:text-emerald-400 transition-colors'}`}>
              <CheckCircle2 className="w-6 h-6" />
            </div>
            
            <div className="flex-1">
              <div className="flex justify-between items-start mb-1">
                <h3 className={`font-semibold ${dose.isTaken ? 'text-neutral-500 dark:text-neutral-400 line-through' : 'text-neutral-900 dark:text-neutral-100'}`}>
                  {dose.medication}
                </h3>
                <span className={`text-xs font-medium px-2 py-1 rounded-md ${
                  dose.timeOfDay === 'Morning' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                  dose.timeOfDay === 'Evening' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' :
                  'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                }`}>
                  {dose.timeOfDay}
                </span>
              </div>
              
              <div className="flex items-center gap-4 text-sm mt-2">
                <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                  <span className="bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-800/50">
                    {dose.amount}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
                  <Clock className="w-3.5 h-3.5" />
                  {dose.frequency}
                </div>
              </div>
            </div>
            
          </div>
        ))}
      </div>
      
      <div className="bg-amber-50 dark:bg-amber-900/10 border-t border-amber-100 dark:border-amber-900/30 p-4 flex gap-3 items-start">
        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
          <strong>Important:</strong> Start low and go slow. Wait at least 2 hours before increasing any dosage if you do not feel the desired effects.
        </p>
      </div>
    </div>
  );
}
