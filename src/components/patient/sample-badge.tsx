import { cn } from "@/lib/utils/cn";

/**
 * Honest "Sample data" marker. Placed on patient-facing surfaces that show
 * illustrative/demo content rather than the patient's own records, so nothing
 * fabricated is presented as real clinical data. (Hybrid honesty pass — used
 * where there is no real data source yet to gate behind an empty state.)
 */
export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5",
        "text-[10px] font-semibold uppercase tracking-wide text-amber-700",
        className,
      )}
    >
      Sample data
    </span>
  );
}
