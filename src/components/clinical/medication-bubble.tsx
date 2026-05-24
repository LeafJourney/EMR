// SAFE: dead-export-allowed reason="MedicationBubble components for EMR-701"

import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * EMR-701 — Medication category bubble.
 *
 * Stackable colored tags shown next to each medication line. A single med
 * can carry multiple categories (e.g. Alprazolam → Controlled + Rx).
 *
 * Colors are visually distinct in dense lists per the EMR-701 acceptance.
 */

export type MedicationCategory =
  | "Rx"
  | "cannabis"
  | "OTC"
  | "supplement"
  | "Controlled";

export const MEDICATION_CATEGORIES: readonly MedicationCategory[] = [
  "Rx",
  "cannabis",
  "OTC",
  "supplement",
  "Controlled",
] as const;

const CATEGORY_CLASSES: Record<MedicationCategory, string> = {
  Rx: "bg-blue-100 text-blue-800 border-blue-200",
  cannabis: "bg-emerald-100 text-emerald-800 border-emerald-200",
  OTC: "bg-slate-100 text-slate-700 border-slate-200",
  supplement: "bg-amber-100 text-amber-800 border-amber-200",
  Controlled: "bg-red-100 text-red-800 border-red-200",
};

const CATEGORY_LABEL: Record<MedicationCategory, string> = {
  Rx: "Rx",
  cannabis: "cannabis",
  OTC: "OTC",
  supplement: "supplement",
  Controlled: "Controlled",
};

export function MedicationBubble({
  category,
  className,
}: {
  category: MedicationCategory;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border tracking-wide",
        CATEGORY_CLASSES[category],
        className,
      )}
      data-medication-category={category}
    >
      {CATEGORY_LABEL[category]}
    </span>
  );
}

export function MedicationBubbleStack({
  categories,
  className,
}: {
  /** Order is preserved as written. Empty array renders nothing. */
  categories: MedicationCategory[];
  className?: string;
}) {
  if (categories.length === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {categories.map((c) => (
        <MedicationBubble key={c} category={c} />
      ))}
    </span>
  );
}

/**
 * Helper used by both UI and tests — sort categories the same way the chart
 * displays them (Controlled first when present, then Rx, then everything
 * else in canonical order).
 */
export function sortMedicationCategories(
  cats: MedicationCategory[],
): MedicationCategory[] {
  const RANK: Record<MedicationCategory, number> = {
    Controlled: 0,
    Rx: 1,
    cannabis: 2,
    OTC: 3,
    supplement: 4,
  };
  return cats
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .sort((a, b) => RANK[a] - RANK[b]);
}
