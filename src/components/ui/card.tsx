"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { cardHover } from "@/lib/ui/motion";

/**
 * Base card. Warm surface with a hairline border. Supports a `tone`
 * variant for subtle ambient / raised visual treatments.
 *
 * Opt-in motion: pass `motion="hover"` to get the shared `cardHover` preset
 * (subtle lift + scale on hover, snap-back on tap). The default is no motion
 * so existing usages stay byte-identical and we don't regress page weight.
 *
 * The motion path always respects prefers-reduced-motion via `useReducedMotion`.
 */
type Tone = "default" | "raised" | "ambient" | "outlined" | "glass" | "glassStrong";
type CardMotion = "none" | "hover";

const TONES: Record<Tone, string> = {
  default: "bg-surface border border-border/80 shadow-sm",
  raised: "bg-surface-raised border border-border shadow-md",
  ambient: "relative overflow-hidden ambient border border-border shadow-md",
  outlined: "bg-transparent border border-dashed border-border-strong/60",
  glass: "liquid-glass",
  glassStrong: "liquid-glass-strong",
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  /**
   * Opt into framer-motion micro-interactions. Default `"none"` keeps Card a
   * plain `<div>`. `"hover"` upgrades it to a `motion.div` with `cardHover`.
   */
  motion?: CardMotion;
}

/**
 * Inner motion-enabled card. Isolated as its own component so the public
 * Card stays a hookless `<div>` when callers don't opt into motion — that
 * keeps SSR markup identical and avoids paying for framer-motion on every
 * card in the app.
 */
function HoverCard({ className, tone = "default", ...props }: CardProps) {
  const reduce = useReducedMotion() ?? false;
  const hover = cardHover(reduce);
  return (
    <motion.div
      className={cn("rounded-xl", TONES[tone], className)}
      {...hover}
      {...(props as React.ComponentProps<typeof motion.div>)}
    />
  );
}

export function Card({ motion: motionMode = "none", ...rest }: CardProps) {
  if (motionMode === "hover") {
    return <HoverCard {...rest} />;
  }
  const { tone = "default", className, ...divProps } = rest;
  return (
    <div
      className={cn("rounded-xl", TONES[tone], className)}
      {...divProps}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pt-6 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-display text-lg font-medium text-text tracking-tight",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-text-muted mt-1.5", className)} {...props} />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pb-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-6 py-4 border-t border-border/60 flex items-center justify-between",
        className
      )}
      {...props}
    />
  );
}
