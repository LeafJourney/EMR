import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { AnimatedNumber } from "./animated-number";
import { MiniSparkline } from "./mini-sparkline";

export function MetricTile({
  label,
  value,
  delta,
  hint,
  accent,
  className,
  /** Optional 7-ish point trend series rendered as an inline mini sparkline. */
  trend,
  /** When `value` is a plain number, animate it 0 → value (or prev → next on update). */
  animate = true,
}: {
  label: string;
  value: React.ReactNode;
  delta?: string;
  hint?: string;
  accent?: "forest" | "amber" | "none";
  className?: string;
  trend?: number[];
  animate?: boolean;
}) {
  const accentClass =
    accent === "forest"
      ? "before:bg-accent"
      : accent === "amber"
        ? "before:bg-highlight"
        : "before:bg-border-strong/50";

  // If value is a plain finite number, route it through AnimatedNumber so we
  // get a smooth ease-out tween + tabular-nums width-stability for free.
  // Everything else (strings, JSX, "$1.2k", "84%") renders as-is — the
  // upstream caller has already done bespoke formatting.
  const renderedValue =
    animate && typeof value === "number" && Number.isFinite(value) ? (
      <AnimatedNumber value={value} />
    ) : (
      value
    );

  return (
    <div
      className={cn(
        "relative bg-surface-raised border border-border rounded-xl p-5 shadow-sm overflow-hidden",
        "before:content-[''] before:absolute before:left-0 before:top-4 before:bottom-4 before:w-[3px] before:rounded-r-full",
        accentClass,
        className
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-3xl font-medium text-text tabular-nums leading-none">
          {renderedValue}
        </span>
        {delta && (
          <span className="text-xs text-text-muted tabular-nums">{delta}</span>
        )}
        {trend && trend.length > 1 && (
          <span className="ml-auto self-center opacity-80">
            <MiniSparkline values={trend} />
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-text-subtle mt-2">{hint}</p>}
    </div>
  );
}
