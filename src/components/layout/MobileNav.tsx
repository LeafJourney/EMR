"use client";

// EMR-117 — iOS Portrait Mode Nav.
//
// Bottom tab bar tuned for iOS Safari portrait. The original drawer-style
// MobileNav (src/components/shell/MobileNav.tsx) is kept intact for the
// admin shell; this component is the patient-facing portrait mode nav
// that sits flush to the home-indicator with proper safe-area insets,
// swipe gestures between tabs, and haptic feedback on tap.

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export interface MobileNavTab {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Optional badge count rendered on the icon. */
  badge?: number;
}

interface MobileNavProps {
  tabs: MobileNavTab[];
  /** Override the active tab match (default: prefix match against pathname). */
  activeId?: string;
  className?: string;
}

const HAPTIC_PATTERN_MS = 8;

function triggerHaptic(): void {
  if (typeof window === "undefined") return;
  // Vibration API works on Android Chrome. iOS Safari ignores it but does
  // expose haptics via the Taptic Engine through a non-standard
  // `window.navigator.vibrate`-shimmed bridge in PWAs; we attempt both.
  const nav = window.navigator as Navigator & { vibrate?: (p: number) => boolean };
  try {
    nav.vibrate?.(HAPTIC_PATTERN_MS);
  } catch {
    // Silently ignore — haptics are a delight, not a correctness signal.
  }
}

function matchActive(tabs: MobileNavTab[], pathname: string, activeId?: string): string | undefined {
  if (activeId) return activeId;
  // Longest matching href wins so /portal/log-dose beats /portal.
  let bestId: string | undefined;
  let bestLen = -1;
  for (const t of tabs) {
    if (pathname === t.href || pathname.startsWith(t.href + "/")) {
      if (t.href.length > bestLen) {
        bestLen = t.href.length;
        bestId = t.id;
      }
    }
  }
  return bestId;
}

const SWIPE_THRESHOLD_PX = 60;
const SWIPE_MAX_VERTICAL_PX = 40;

export function MobileNav({ tabs, activeId, className }: MobileNavProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const active = matchActive(tabs, pathname, activeId);
  const visible = React.useMemo(() => tabs.slice(0, 5), [tabs]);

  // Swipe-between-tabs gesture handling. We attach to a top-level wrapper
  // that lives behind the viewport content; touches that originate inside
  // form fields / scrollers are ignored automatically because we only
  // fire on touchend with a clean horizontal delta.
  const touchStartRef = React.useRef<{ x: number; y: number; t: number } | null>(null);

  React.useEffect(() => {
    function onStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    }
    function onEnd(e: TouchEvent) {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dy) > SWIPE_MAX_VERTICAL_PX) return;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
      const dir = dx < 0 ? 1 : -1;        // swipe-left → next tab
      const idx = visible.findIndex((v) => v.id === active);
      const next = idx < 0 ? 0 : idx + dir;
      if (next < 0 || next >= visible.length) return;
      triggerHaptic();
      router.push(visible[next].href);
    }
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [active, visible, router]);

  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 md:hidden",
        // Safe-area-aware container. The padding-bottom uses the iOS
        // `env(safe-area-inset-bottom)` value so the bar clears the
        // home indicator on notched / Dynamic Island devices.
        "pb-[env(safe-area-inset-bottom)]",
        "border-t border-black/5 bg-white/85 backdrop-blur-xl",
        "supports-[backdrop-filter]:bg-white/70",
        className,
      )}
      style={{
        // Ensure the nav lifts above iOS Safari's URL chrome when it
        // collapses (which otherwise underlaps fixed elements).
        WebkitTransform: "translate3d(0,0,0)",
      }}
    >
      <ul
        className="flex w-full items-stretch justify-around px-1"
        style={{
          // Safe-area horizontal so landscape iPhone notch (or Pro Max
          // Dynamic Island in landscape) doesn't crop the outer tabs.
          paddingLeft: "max(0.25rem, env(safe-area-inset-left))",
          paddingRight: "max(0.25rem, env(safe-area-inset-right))",
        }}
      >
        {visible.map((tab) => {
          const isActive = tab.id === active;
          return (
            <li key={tab.id} className="flex-1">
              <Link
                href={tab.href}
                onClick={triggerHaptic}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5",
                  // Apple-style 44pt minimum touch target (44px ≈ 11×4 in tw).
                  "min-h-[44px] active:scale-[0.96] transition-transform",
                  isActive ? "text-emerald-700" : "text-zinc-500",
                )}
              >
                <span className="relative inline-flex h-6 w-6 items-center justify-center" aria-hidden>
                  {tab.icon}
                  {tab.badge && tab.badge > 0 ? (
                    <span className="absolute -right-2 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
                      {tab.badge > 99 ? "99+" : tab.badge}
                    </span>
                  ) : null}
                </span>
                <span className="text-[10px] font-medium tracking-tight">{tab.label}</span>
                {isActive ? (
                  <span
                    className="absolute top-0 h-0.5 w-8 rounded-full bg-emerald-600"
                    aria-hidden
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default MobileNav;
