"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// AnimatedNumber — rolls from the previously-displayed value to a new value
// using requestAnimationFrame and an ease-out curve. Respects
// `prefers-reduced-motion` (sets the next value instantly).
//
// When a new `value` prop arrives we tween from the *current displayed*
// value — never from 0 — so KPI tiles feel smooth on live re-renders.
//
// Formatting is stable: defaults to Intl.NumberFormat so digit widths
// align under tabular-nums. Callers can override with `format` for money,
// percent, units, etc.
// ---------------------------------------------------------------------------

export interface AnimatedNumberProps {
  /** Target numeric value */
  value: number;
  /** Animation duration in ms (default 1200) */
  duration?: number;
  /** Decimal places when using the default formatter */
  decimals?: number;
  /** Optional custom formatter — receives the *interpolated* number */
  format?: (n: number) => string;
  /** Pre-pended to the formatted number (e.g. "$") */
  prefix?: string;
  /** Appended to the formatted number (e.g. "%") */
  suffix?: string;
  /** Apply tabular-nums + leading-none (default true) */
  tabular?: boolean;
  className?: string;
  /** Optional aria-label override; otherwise the final value is announced */
  ariaLabel?: string;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefers(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return prefers;
}

export function AnimatedNumber({
  value,
  duration = 1200,
  decimals = 0,
  format,
  prefix,
  suffix,
  tabular = true,
  className,
  ariaLabel,
}: AnimatedNumberProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  // displayed value drives the rendered string; we lazy-init to the target so
  // SSR/CSR hydration emits the same final markup. The animation only kicks in
  // on *subsequent* value changes, which is the smooth-tween behaviour we want.
  const [displayed, setDisplayed] = React.useState<number>(value);
  const fromRef = React.useRef<number>(value);
  const rafRef = React.useRef<number | null>(null);
  const startRef = React.useRef<number>(0);

  // Stable formatter — falls back to Intl.NumberFormat with caller-controlled decimals.
  const formatter = React.useMemo(() => {
    if (format) return format;
    const nf = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return (n: number) => nf.format(n);
  }, [format, decimals]);

  React.useEffect(() => {
    // Cancel any in-flight tween before starting a new one
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (prefersReducedMotion || duration <= 0 || displayed === value) {
      setDisplayed(value);
      fromRef.current = value;
      return;
    }

    fromRef.current = displayed;
    startRef.current = performance.now();
    const from = fromRef.current;
    const to = value;

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      const next = from + (to - from) * eased;
      setDisplayed(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // We intentionally exclude `displayed` — it changes every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, prefersReducedMotion]);

  const text = formatter(displayed);
  const finalText = formatter(value);

  return (
    <span
      className={cn(tabular && "tabular-nums leading-none", className)}
      aria-label={ariaLabel ?? `${prefix ?? ""}${finalText}${suffix ?? ""}`}
    >
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
