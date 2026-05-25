"use client";

import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";

/**
 * MIPS final-score gauge — half-donut radial showing the score against the
 * 100-point scale, with the 75-pt neutral threshold highlighted by an
 * underlay arc.
 */
export function ScoreGauge({
  value,
  label,
  size = 220,
  tone = "accent",
}: {
  value: number;
  label?: string;
  size?: number;
  tone?: "accent" | "warning" | "danger" | "highlight";
}) {
  const colors: Record<typeof tone, string> = {
    accent: "var(--accent)",
    warning: "#D4A24E",
    danger: "var(--danger)",
    highlight: "var(--highlight)",
  };
  const arcColor = colors[tone];
  const data = [{ name: "score", value: Math.max(0, Math.min(value, 100)), fill: arcColor }];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="72%"
          outerRadius="100%"
          startAngle={210}
          endAngle={-30}
          data={data}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            background={{ fill: "var(--border)" }}
            dataKey="value"
            cornerRadius={12}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        aria-hidden="true"
      >
        <div className="font-display text-4xl text-text tabular-nums">
          {value.toFixed(1)}
        </div>
        {label && (
          <div className="text-[10px] uppercase tracking-[0.16em] text-text-subtle mt-1">
            {label}
          </div>
        )}
      </div>
    </div>
  );
}
