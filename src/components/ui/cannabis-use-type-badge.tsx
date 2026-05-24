"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Tooltip } from "@/components/ui/tooltip";
import {
  USE_TYPE_LABEL,
  type CannabisUseType,
} from "@/lib/domain/cannabis-use-type";

const STYLES: Record<CannabisUseType, string> = {
  medical:
    "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900",
  recreational:
    "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
  unspecified:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800",
};

const EMOJI: Record<CannabisUseType, string> = {
  medical: "🩺",
  recreational: "🎉",
  unspecified: "❓",
};

/**
 * Pill that surfaces the EMR-346 medical/recreational classification.
 *
 * Wherever a patient, dose log, or product purchase is shown, this badge
 * makes the use-type explicit so clinicians (and downstream analytics)
 * never have to guess whether cannabis is being used medically.
 */
export function CannabisUseTypeBadge({
  type,
  className,
  showEmoji = true,
}: {
  type: CannabisUseType;
  className?: string;
  showEmoji?: boolean;
}) {
  return (
    <Tooltip content={USE_TYPE_LABEL[type]}>
      <span
        tabIndex={0}
        aria-label={`Cannabis use type: ${USE_TYPE_LABEL[type]}`}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          STYLES[type],
          className,
        )}
      >
        {showEmoji && <span aria-hidden>{EMOJI[type]}</span>}
        {USE_TYPE_LABEL[type]}
      </span>
    </Tooltip>
  );
}
