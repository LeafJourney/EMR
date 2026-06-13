import * as React from "react";
import type { RunwayTrend } from "@/lib/finance/cash-flow-runway";

export function RunwaySparkline({ trend }: { trend: RunwayTrend }) {
  const points = trend.points.map((point) => `${point.x},${point.y}`).join(" ");
  const strokeClass =
    trend.tone === "bad"
      ? "stroke-danger"
      : trend.tone === "good"
        ? "stroke-[color:var(--success)]"
        : "stroke-accent";

  return (
    <div className="mt-3 flex items-center gap-2" aria-label={trend.caption}>
      <svg className="h-8 w-20 shrink-0 overflow-visible" viewBox="0 0 100 28" role="img" aria-label={trend.caption}>
        <polyline points={points} className={`fill-none ${strokeClass}`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {trend.points.map((point) => (
          <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="2.5" className={`fill-background ${strokeClass}`} strokeWidth="2" />
        ))}
      </svg>
      <span className="min-w-0 text-[10px] leading-tight text-text-subtle">{trend.caption}</span>
    </div>
  );
}
