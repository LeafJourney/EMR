import React from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, ArrowRight } from "lucide-react";
import { CanopyCellProps } from "@/lib/canopy/types";
import { cn } from "@/lib/utils/cn";

export function CanopyCell({ metric, comparisonMode = "prior_period", isLoading = false }: CanopyCellProps) {
  if (isLoading) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-surface/40 p-6 shadow-sm backdrop-blur-md animate-pulse">
        <div className="h-4 w-1/3 rounded-full bg-border/40 mb-4"></div>
        <div className="h-10 w-2/3 rounded-xl bg-border/30"></div>
        <div className="mt-6 h-3 w-1/4 rounded-full bg-border/20"></div>
      </div>
    );
  }

  const isPositive = metric.trendPercentage !== undefined && metric.trendPercentage > 0;
  const isNegative = metric.trendPercentage !== undefined && metric.trendPercentage < 0;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-surface p-6 shadow-sm transition-all duration-300 ease-smooth hover:-translate-y-1 hover:shadow-md hover:border-accent/40">
      {/* Subtle background gradient that activates on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col h-full">
        <h3 className="text-[12px] font-semibold tracking-wider uppercase text-text-muted">{metric.title}</h3>
        
        <div className="mt-3 flex items-baseline gap-3">
          <span className="font-display text-4xl font-medium tracking-tight text-text">
            {metric.currentValue}
          </span>
          
          {metric.trendPercentage !== undefined && comparisonMode !== "none" && (
            <div className={cn(
              "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
              isPositive ? "bg-green-500/10 text-green-700 dark:text-green-400" : 
              isNegative ? "bg-red-500/10 text-red-700 dark:text-red-400" : 
              "bg-surface-muted text-text-muted"
            )}>
              {isPositive ? <ArrowUpRight className="h-3 w-3" /> : isNegative ? <ArrowDownRight className="h-3 w-3" /> : null}
              <span>{Math.abs(metric.trendPercentage)}%</span>
            </div>
          )}
        </div>
        
        <div className="mt-auto pt-6">
          <Link 
            href={metric.drilldownUrl} 
            className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2 rounded"
          >
            <span>View Patients</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  );
}
