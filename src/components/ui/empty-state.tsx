import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { EmptyIllustration } from "./ornament";

/**
 * Monday.com / Linear / Stripe-tier empty state.
 *
 * Supports an optional illustration (or icon), a short warm title, a one-to-two
 * sentence description, optional primary + secondary CTAs, and an optional
 * "What you can do next" tips list. Tone is encouraging, never sarcastic.
 *
 * For the simplest call site you can still just pass `title` and (optionally)
 * `description` — every other prop is opt-in.
 */
export function EmptyState({
  icon,
  illustration,
  title,
  description,
  action,
  primaryAction,
  secondaryAction,
  tips,
  align = "center",
  className,
}: {
  /** Legacy single-icon slot. Wins over `illustration` when both are provided. */
  icon?: React.ReactNode;
  /** Preferred slot for an ~80×80 SVG illustration. */
  illustration?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** Legacy single-action slot. Rendered after primary/secondary when present. */
  action?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  /** Optional "What you can do next" hints. Each entry renders as a row. */
  tips?: React.ReactNode[];
  align?: "center" | "start";
  className?: string;
}) {
  const visual = icon ?? illustration ?? <EmptyIllustration size={80} />;
  const isStart = align === "start";
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-border-strong/60 bg-surface/60 p-10 md:p-12",
        isStart
          ? "flex flex-col items-start text-left"
          : "flex flex-col items-center text-center",
        className,
      )}
      role="status"
    >
      <div className={cn("mb-1", isStart ? "" : "")} aria-hidden="true">
        {visual}
      </div>
      <h3 className="font-display text-lg text-text mt-2">{title}</h3>
      {description && (
        <p
          className={cn(
            "text-sm text-text-muted mt-2 leading-relaxed",
            isStart ? "max-w-xl" : "max-w-md",
          )}
        >
          {description}
        </p>
      )}
      {(primaryAction || secondaryAction || action) && (
        <div
          className={cn(
            "mt-6 flex flex-wrap gap-2",
            isStart ? "justify-start" : "justify-center",
          )}
        >
          {primaryAction}
          {secondaryAction}
          {action}
        </div>
      )}
      {tips && tips.length > 0 && (
        <div
          className={cn(
            "mt-7 w-full max-w-md rounded-lg border border-border/70 bg-surface/80 px-4 py-3",
            isStart ? "" : "text-left",
          )}
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
            What you can do next
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-text">
            {tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                />
                <span className="leading-snug">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
