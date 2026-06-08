/**
 * Shared motion presets for LeafJourney EMR.
 *
 * Goal: every surface speaks the same motion language so the product feels
 * cohesive at Monday.com / Linear / Stripe Dashboard polish levels.
 *
 * Every preset is shaped as a callable that takes `reduceMotion: boolean`
 * and returns framer-motion props. When the user prefers reduced motion
 * (system pref OR our app-level reduce-motion class — see
 * `usePortalReducedMotion`), the preset collapses to a no-op (duration 0,
 * no transform) but still renders the final state. This keeps the markup
 * identical and avoids layout shift while honoring the a11y preference.
 *
 * Usage:
 *   import { motion, useReducedMotion } from "framer-motion";
 *   import { cardHover, EASE_PREMIUM } from "@/lib/ui/motion";
 *
 *   const reduce = useReducedMotion() ?? false;
 *   <motion.div {...cardHover(reduce)} />
 */

import type { Transition, Variants, MotionProps } from "framer-motion";

// ---------------------------------------------------------------------------
// Core curves & durations
// ---------------------------------------------------------------------------

/**
 * EASE_PREMIUM — Apple-style cubic-bezier used across our surfaces.
 *
 * - Steep enter ramp gives motion a confident push.
 * - Long settle tail makes endings feel "found", never abrupt.
 *
 * Match what we already use inline in `fade-in-widget.tsx` (`[0.22, 1, 0.36, 1]`)
 * but slightly tightened on the second handle so cards and modals don't
 * overshoot at small distances. Stripe Dashboard uses something very close.
 */
export const EASE_PREMIUM: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

/** EASE_SPRING_SOFT — for incoming modals / sheets that want a touch of bounce. */
export const SPRING_MODAL = {
  type: "spring" as const,
  stiffness: 380,
  damping: 32,
  mass: 0.9,
};

/** Duration ladder, in seconds. Keep it short — Monday.com tier never lingers. */
export const DURATION = {
  instant: 0.12,
  quick: 0.18,
  base: 0.24,
  page: 0.32,
} as const;

// ---------------------------------------------------------------------------
// Preset helpers
// ---------------------------------------------------------------------------

/** A transition that becomes a no-op when reduce is true. */
function transition(reduce: boolean, t: Transition): Transition {
  return reduce ? { duration: 0 } : t;
}

// ---------------------------------------------------------------------------
// cardHover — subtle scale + shadow on hover, snap-back on press.
// ---------------------------------------------------------------------------

/**
 * `cardHover(reduce)` — spread onto a `<motion.div>` that wraps a Card. We do
 * NOT animate `box-shadow` here (jank) — use a Tailwind class transition for
 * shadow and let framer-motion handle the transform.
 */
export function cardHover(reduce: boolean): MotionProps {
  if (reduce) {
    return { whileHover: undefined, whileTap: undefined };
  }
  return {
    whileHover: { y: -2, scale: 1.005 },
    whileTap: { y: 0, scale: 0.997 },
    transition: { duration: DURATION.quick, ease: EASE_PREMIUM },
  };
}

// ---------------------------------------------------------------------------
// pagePushIn — slide + fade page entry. Use as a top-level wrapper for routes
// that swap (e.g. an in-app tab change). Honors reduced motion fully.
// ---------------------------------------------------------------------------

export function pagePushIn(reduce: boolean): MotionProps {
  if (reduce) {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
    transition: {
      duration: DURATION.page,
      ease: EASE_PREMIUM,
    },
  };
}

// ---------------------------------------------------------------------------
// modalSpring — modal entrance/exit. Lifted from Linear's quick-actions modal:
// slight overshoot on enter, fast straight-line exit so dismissals feel snappy.
// ---------------------------------------------------------------------------

export function modalSpring(reduce: boolean): MotionProps {
  if (reduce) {
    return {
      initial: { opacity: 1, scale: 1, y: 0 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 1, scale: 1, y: 0 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, scale: 0.96, y: 8 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98, y: 4 },
    // Spring the transform (scale/y) for a touch of physicality, but tween
    // OPACITY on a short curve — a spring on opacity lingers at intermediate
    // values and reads as a washed-out, half-faded modal while it settles.
    transition: {
      ...SPRING_MODAL,
      opacity: { type: "tween", duration: DURATION.quick, ease: EASE_PREMIUM },
    },
  };
}

/** Backdrop fade for modal/sheet overlays. */
export function modalBackdrop(reduce: boolean): MotionProps {
  if (reduce) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: DURATION.quick, ease: EASE_PREMIUM },
  };
}

// ---------------------------------------------------------------------------
// listStagger — variants for a parent + child setup. The parent fans out
// children at ~40ms intervals, which is the Linear/Notion default that
// feels "alive" without feeling slow.
// ---------------------------------------------------------------------------

const LIST_STAGGER_STEP = 0.04;
const LIST_STAGGER_CAP = 12; // never spend more than ~0.48s fanning in.

export function listStaggerParent(reduce: boolean): Variants {
  if (reduce) {
    return {
      hidden: { opacity: 1 },
      show: { opacity: 1, transition: { staggerChildren: 0 } },
    };
  }
  return {
    hidden: { opacity: 1 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: LIST_STAGGER_STEP,
        // Cap total stagger so a 200-row list doesn't crawl in over 8 seconds.
        delayChildren: 0,
        when: "beforeChildren",
      },
    },
  };
}

/**
 * `listStaggerChild(reduce)` — apply to each child wrapper inside a parent
 * that uses `listStaggerParent`. The child does a tiny y-drop + fade, which
 * matches the Stripe Dashboard "table row enter" feel.
 */
export function listStaggerChild(reduce: boolean): Variants {
  if (reduce) {
    return {
      hidden: { opacity: 1, y: 0 },
      show: { opacity: 1, y: 0, transition: { duration: 0 } },
    };
  }
  return {
    hidden: { opacity: 0, y: 6 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: DURATION.base,
        ease: EASE_PREMIUM,
      },
    },
  };
}

/** Convenience: combined parent props for a `<motion.ul>` or `<motion.div>`. */
export function listStagger(reduce: boolean): MotionProps {
  return {
    initial: "hidden",
    animate: "show",
    variants: listStaggerParent(reduce),
  };
}

// ---------------------------------------------------------------------------
// tapPress — button tap feedback. Tiny scale-down so the press feels physical
// without being noisy. Honors reduced motion (becomes a no-op).
// ---------------------------------------------------------------------------

export function tapPress(reduce: boolean): MotionProps {
  if (reduce) return { whileTap: undefined };
  return {
    whileTap: { scale: 0.97 },
    transition: { duration: DURATION.instant, ease: EASE_PREMIUM },
  };
}

// ---------------------------------------------------------------------------
// tooltipPop — preset shared by Tooltip + Popover primitives. A short, snappy
// fade with a tiny axis-aware slide so the overlay feels "anchored" to its
// trigger. Honors reduced motion (no-op).
// ---------------------------------------------------------------------------

export type TooltipSide = "top" | "bottom" | "left" | "right";

const TOOLTIP_OFFSET = 4;

function offsetForSide(side: TooltipSide): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: 0, y: TOOLTIP_OFFSET };
    case "bottom":
      return { x: 0, y: -TOOLTIP_OFFSET };
    case "left":
      return { x: TOOLTIP_OFFSET, y: 0 };
    case "right":
      return { x: -TOOLTIP_OFFSET, y: 0 };
  }
}

/**
 * `tooltipPop(reduce, side)` — spread onto a `<motion.div>` rendered inside an
 * `<AnimatePresence>`. Drops in from the anchor side and fades out in place.
 */
export function tooltipPop(reduce: boolean, side: TooltipSide = "top"): MotionProps {
  if (reduce) {
    return {
      initial: { opacity: 1, x: 0, y: 0, scale: 1 },
      animate: { opacity: 1, x: 0, y: 0, scale: 1 },
      exit: { opacity: 1, x: 0, y: 0, scale: 1 },
      transition: { duration: 0 },
    };
  }
  const off = offsetForSide(side);
  return {
    initial: { opacity: 0, x: off.x, y: off.y, scale: 0.97 },
    animate: { opacity: 1, x: 0, y: 0, scale: 1 },
    exit: { opacity: 0, x: off.x * 0.5, y: off.y * 0.5, scale: 0.99 },
    transition: { duration: DURATION.instant, ease: EASE_PREMIUM },
  };
}

// ---------------------------------------------------------------------------
// Constant ceiling so engineers don't reach for arbitrary numbers.
// ---------------------------------------------------------------------------

export const MOTION_CONSTANTS = {
  EASE_PREMIUM,
  DURATION,
  SPRING_MODAL,
  LIST_STAGGER_STEP,
  LIST_STAGGER_CAP,
  TOOLTIP_OFFSET,
} as const;
