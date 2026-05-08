import React from "react";
import { CheckCircle2, Circle, Clock, ArrowRight } from "lucide-react";

export interface RoadmapStep {
  id: string;
  title: string;
  description: string;
  status: "completed" | "current" | "upcoming";
  date?: string;
}

/**
 * Health Roadmap Component (EMR-010)
 * Visualizes the patient's long-term care plan and current stage.
 */
export function HealthRoadmap({ steps = [] }: { steps?: RoadmapStep[] }) {
  // Default steps if none provided
  const defaultSteps: RoadmapStep[] = [
    {
      id: "step-1",
      title: "Initial Consultation",
      description: "Review medical history and establish care goals.",
      status: "completed",
      date: "Oct 12, 2023",
    },
    {
      id: "step-2",
      title: "Titration Phase",
      description: "Find the optimal dosage with minimal side effects.",
      status: "current",
      date: "Oct 26 - Nov 9",
    },
    {
      id: "step-3",
      title: "Maintenance & Monitoring",
      description: "Steady-state usage with monthly check-ins.",
      status: "upcoming",
    },
    {
      id: "step-4",
      title: "6-Month Efficacy Review",
      description: "Comprehensive evaluation of symptom improvement.",
      status: "upcoming",
    },
  ];

  const displaySteps = steps.length > 0 ? steps : defaultSteps;

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-6 py-5 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            Your Health Roadmap
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Tracking your progress toward wellness goals.
          </p>
        </div>
      </div>
      
      <div className="p-6">
        <div className="relative">
          {/* Vertical Timeline Line */}
          <div className="absolute left-[15px] top-4 bottom-8 w-0.5 bg-neutral-200 dark:bg-neutral-800"></div>
          
          <div className="flex flex-col gap-6">
            {displaySteps.map((step, index) => {
              const isLast = index === displaySteps.length - 1;
              const isCompleted = step.status === "completed";
              const isCurrent = step.status === "current";
              
              return (
                <div key={step.id} className="relative flex gap-5">
                  {/* Icon Column */}
                  <div className="relative z-10 bg-white dark:bg-neutral-900 pt-1 shrink-0">
                    {isCompleted ? (
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 bg-white dark:bg-neutral-900 rounded-full" />
                    ) : isCurrent ? (
                      <div className="w-8 h-8 rounded-full border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
                      </div>
                    ) : (
                      <Circle className="w-8 h-8 text-neutral-300 dark:text-neutral-700 bg-white dark:bg-neutral-900 rounded-full" />
                    )}
                  </div>
                  
                  {/* Content Column */}
                  <div className={`flex flex-col pb-2 ${!isLast ? '' : ''}`}>
                    <h3 className={`text-base font-semibold ${
                      isCompleted ? "text-neutral-900 dark:text-neutral-100" :
                      isCurrent ? "text-emerald-700 dark:text-emerald-400" :
                      "text-neutral-500 dark:text-neutral-500"
                    }`}>
                      {step.title}
                    </h3>
                    
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 mb-2">
                      {step.description}
                    </p>
                    
                    {step.date && (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                        <Clock className="w-3.5 h-3.5" />
                        {step.date}
                      </div>
                    )}
                    
                    {isCurrent && (
                      <div className="mt-3">
                        <button className="flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md transition-colors">
                          View Current Tasks
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
