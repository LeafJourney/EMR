import * as React from "react";
import { cn } from "@/lib/utils/cn";

type Severity = "red" | "yellow" | "green";

const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; leaf: string; badge: string }
> = {
  red: {
    label: "Contraindicated",
    leaf: "🍂",
    badge: "bg-red-50 text-danger border-red-200",
  },
  yellow: {
    label: "Caution",
    leaf: "🌱",
    badge:
      "bg-highlight-soft text-[color:var(--highlight-hover)] border-highlight/30",
  },
  green: {
    label: "Safe",
    leaf: "🌿",
    badge: "bg-accent-soft text-success border-[color:var(--success)]/20",
  },
};

export function InteractionBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  const config = SEVERITY_CONFIG[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium rounded-full border tracking-wide",
        config.badge,
        className
      )}
    >
      <span aria-hidden="true" className="text-[10px] leading-none">
        {config.leaf}
      </span>
      {config.label}
    </span>
  );
}
