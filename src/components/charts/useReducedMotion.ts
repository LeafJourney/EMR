"use client";

import * as React from "react";

/**
 * Shared reduced-motion hook for the chart wrappers. Reads the
 * `prefers-reduced-motion: reduce` media query and disables recharts
 * animations when the user has opted out.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handle = () => setReduced(mq.matches);
    handle();
    mq.addEventListener?.("change", handle);
    return () => mq.removeEventListener?.("change", handle);
  }, []);
  return reduced;
}
