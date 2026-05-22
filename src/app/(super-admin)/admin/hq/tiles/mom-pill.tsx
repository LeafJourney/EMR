import { cn } from "@/lib/utils/cn";
import { formatMomPct, momTone } from "./format";

const TONE_CLASSES: Record<"positive" | "negative" | "neutral", string> = {
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  negative: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-surface-muted text-text-muted border-border-strong/40",
};

export function MomPill({
  pct,
  label,
  className,
}: {
  pct: number;
  label?: string;
  className?: string;
}) {
  const tone = momTone(pct);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border tracking-wide tabular-nums",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label ?? formatMomPct(pct)}
    </span>
  );
}
