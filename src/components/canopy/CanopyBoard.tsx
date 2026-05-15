"use client";

import React, { createContext, useContext, useState } from "react";
import { CohortFilter, ComparisonMode } from "@/lib/canopy/types";

interface CanopyBoardContextType {
  globalFilter: CohortFilter;
  setGlobalFilter: (filter: CohortFilter) => void;
  globalComparison: ComparisonMode;
  setGlobalComparison: (mode: ComparisonMode) => void;
}

const CanopyBoardContext = createContext<CanopyBoardContextType | undefined>(undefined);

export function useCanopyBoard() {
  const context = useContext(CanopyBoardContext);
  if (!context) throw new Error("useCanopyBoard must be used within CanopyBoard");
  return context;
}

interface CanopyBoardProps {
  title: string;
  description?: string;
  initialFilter?: CohortFilter;
  initialComparison?: ComparisonMode;
  children: React.ReactNode;
}

export function CanopyBoard({ 
  title, 
  description, 
  initialFilter = {}, 
  initialComparison = "prior_period",
  children 
}: CanopyBoardProps) {
  const [globalFilter, setGlobalFilter] = useState<CohortFilter>(initialFilter);
  const [globalComparison, setGlobalComparison] = useState<ComparisonMode>(initialComparison);

  return (
    <CanopyBoardContext.Provider value={{ globalFilter, setGlobalFilter, globalComparison, setGlobalComparison }}>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 pb-6 border-b border-border/60">
          <div className="space-y-1.5">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-text">{title}</h1>
            {description && <p className="text-base text-text-muted">{description}</p>}
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <select 
                className="appearance-none rounded-xl border border-border/80 bg-surface px-4 py-2 pr-10 text-sm font-medium text-text shadow-sm transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 cursor-pointer"
                value={globalComparison}
                onChange={(e) => setGlobalComparison(e.target.value as ComparisonMode)}
                aria-label="Comparison period"
              >
                <option value="prior_period">vs Prior Period</option>
                <option value="prior_year">vs Prior Year</option>
                <option value="none">No Comparison</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-text-muted">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {children}
        </div>
      </div>
    </CanopyBoardContext.Provider>
  );
}
