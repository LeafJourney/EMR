"use client";

/**
 * PageTransition — drop-in wrapper that applies the shared `pagePushIn`
 * motion preset to a route segment. Honors prefers-reduced-motion via
 * framer-motion's `useReducedMotion`.
 *
 * Why not put this directly in AppShell? AppShell is a server component
 * and we want to keep it that way (cheaper SSR, smaller client bundle).
 * Teams adopt PageTransition surgically per route group / layout file.
 *
 * Usage:
 *   // src/app/(clinician)/clinic/layout.tsx
 *   import { PageTransition } from "@/components/ui/page-transition";
 *   export default function Layout({ children }) {
 *     return <PageTransition>{children}</PageTransition>;
 *   }
 */

import { motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { pagePushIn } from "@/lib/ui/motion";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  // Re-key on pathname so the enter animation actually fires on route swaps.
  const pathname = usePathname();
  const props = pagePushIn(reduce);
  return (
    <motion.div key={pathname} {...props}>
      {children}
    </motion.div>
  );
}
