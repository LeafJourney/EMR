"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * EMR-189 — Mobile-portrait landing-page nav.
 *
 * Renders all primary tabs as a compact icon+label grid that fits on a
 * phone-portrait viewport without a hamburger menu. Tabs are organized
 * into groups; users swipe between groups (or tap the dots).
 *
 * Sized to disappear on tablet+ — the desktop SiteHeader handles those
 * widths.
 */

export interface MobileNavTab {
  label: string;
  href: string;
  icon: string;
  // Optional 6-stop conic gradient. When present the tile renders the
  // icon as a colorful "wheel" disc instead of a flat glyph — used for
  // wheel/pharmacology surfaces so they read as proprietary tools.
  wheelGradient?: boolean;
}

export interface MobileNavGroup {
  id: string;
  label: string;
  tabs: MobileNavTab[];
}

export const DEFAULT_GROUPS: MobileNavGroup[] = [
  {
    id: "explore",
    label: "Explore",
    tabs: [
      { label: "Home", href: "/", icon: "⌂" },
      { label: "About", href: "/about", icon: "✎" },
      { label: "Team", href: "/about/team", icon: "☺" },
      { label: "Business", href: "/about/business", icon: "⧉" },
    ],
  },
  {
    // Surfaces /features, /pricing, /clinicians, and /book-demo on
    // mobile portrait — none of those marketing routes were
    // reachable from the phone-portrait nav before. The desktop
    // SiteHeader exposes Features + Pricing inline; this is the
    // mobile-portrait equivalent. (ux/marketing-polish-stripe-tier)
    id: "product",
    label: "Product",
    tabs: [
      { label: "Features", href: "/features", icon: "✦" },
      { label: "Pricing", href: "/pricing", icon: "✓" },
      { label: "Clinicians", href: "/clinicians", icon: "✚" },
      { label: "Demo", href: "/book-demo", icon: "☆" },
    ],
  },
  {
    id: "learn",
    label: "Learn",
    tabs: [
      { label: "ChatCB", href: "/education", icon: "❦" },
      { label: "Research", href: "/education#research", icon: "⚘" },
      { label: "Wheel", href: "/education#wheel", icon: "", wheelGradient: true },
      { label: "Drug Mix", href: "/education/drug-mix", icon: "⚗" },
    ],
  },
  {
    id: "shop",
    label: "Shop",
    tabs: [
      // LeafMart and Marketplace previously both pointed at the legacy
      // external storefront, which (a) defeated the in-app nav intent
      // and (b) gave the <li key={t.href}> map two children with the
      // same key — duplicate-key React warnings on every page that
      // mounts MobilePortraitNav (caught by find-and-fix pass 8). Both
      // surfaces exist as real internal routes now: /leafmart consumer
      // storefront, /marketplace editorial catalog (PDPs landed in PR
      // #348 / EMR-712).
      { label: "LeafMart", href: "/leafmart", icon: "✿" },
      { label: "Marketplace", href: "/marketplace", icon: "☖" },
      { label: "Store", href: "/store", icon: "☲" },
      { label: "Vendors", href: "/leafmart/vendors", icon: "⚘" },
    ],
  },
  {
    id: "account",
    label: "Account",
    tabs: [
      { label: "Sign in", href: "/sign-in", icon: "➜" },
      // Demo → /book-demo (sales intake), not /sign-up (Clerk
      // account creation). Same fix as the desktop SiteHeader,
      // the homepage hero CTAs, and the closing-CTA bands across
      // /about, /pricing, /security.
      { label: "Demo", href: "/book-demo", icon: "☆" },
      { label: "Security", href: "/security", icon: "☢" },
      { label: "Developer", href: "/developer", icon: "⚙" },
    ],
  },
];

export function MobilePortraitNav({
  groups = DEFAULT_GROUPS,
}: {
  groups?: MobileNavGroup[];
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<(HTMLElement | null)[]>([]);

  // Sync active group with scroll position so the dot indicator is correct
  // even when the user scrolls/swipes manually.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const x = el.scrollLeft;
      const w = el.clientWidth;
      const idx = Math.round(x / w);
      if (idx !== activeIdx && idx >= 0 && idx < groups.length) {
        setActiveIdx(idx);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [activeIdx, groups.length]);

  function jumpTo(idx: number) {
    const el = scrollRef.current;
    if (!el) return;
    const target = idx * el.clientWidth;
    el.scrollTo({ left: target, behavior: "smooth" });
    setActiveIdx(idx);
  }

  return (
    <nav
      aria-label="Site navigation"
      className="md:hidden bg-surface-raised border-b border-border"
    >
      {/* Group selector — chips. Apple HIG: each chip is ≥44pt tall so a
          patient's thumb can flip between groups without missing. */}
      <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar safe-pl safe-pr">
        {groups.map((g, i) => (
          <button
            key={g.id}
            type="button"
            onClick={() => jumpTo(i)}
            aria-pressed={i === activeIdx}
            className={`shrink-0 inline-flex items-center justify-center min-h-[44px] px-4 rounded-full text-[11px] font-medium uppercase tracking-wider transition-colors ${
              i === activeIdx
                ? "bg-accent text-white"
                : "bg-surface-muted text-text-muted hover:text-text"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Swipeable group panels */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar"
      >
        {groups.map((g, i) => (
          <section
            key={g.id}
            ref={(el) => {
              groupRefs.current[i] = el;
            }}
            aria-label={g.label}
            className="shrink-0 w-full snap-start px-3 pb-3 pt-1"
          >
            <ul className="grid grid-cols-4 gap-2">
              {g.tabs.map((t) => (
                <li key={t.label}>
                  <Link
                    href={t.href}
                    className="flex flex-col items-center justify-center gap-1 rounded-xl bg-surface border border-border/60 px-2 py-3 min-h-[64px] hover:bg-surface-muted hover:border-accent/40 active:scale-[0.96] transition-all"
                  >
                    {t.wheelGradient ? (
                      <span
                        className="relative inline-flex h-5 w-5 items-center justify-center rounded-full shadow-[0_2px_6px_-1px_rgba(45,139,94,0.55)]"
                        style={{
                          background:
                            "conic-gradient(from 0deg, #2D8B5E, #4FA77B, #E8A838, #B86896, #6B4F8B, #1F8AB6, #2D8B5E)",
                        }}
                        aria-hidden
                      >
                        <span className="block h-1.5 w-1.5 rounded-full bg-white/90 ring-1 ring-black/5" />
                      </span>
                    ) : (
                      <span
                        className="text-base text-accent leading-none"
                        aria-hidden
                      >
                        {t.icon}
                      </span>
                    )}
                    <span className="text-[10.5px] font-medium text-text leading-tight text-center">
                      {t.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Dot indicator — visual dot stays small (1.5px tall) but the hit
          target is a transparent 44pt button wrapped around it, so a thumb
          can land on either dot without surgical precision. */}
      <div className="flex items-center justify-center gap-0.5 pb-1">
        {groups.map((g, i) => (
          <button
            key={g.id}
            type="button"
            onClick={() => jumpTo(i)}
            aria-label={`Show ${g.label}`}
            className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center"
          >
            <span
              aria-hidden
              className={`h-1.5 rounded-full transition-all ${
                i === activeIdx ? "w-5 bg-accent" : "w-1.5 bg-border-strong/60"
              }`}
            />
          </button>
        ))}
      </div>
    </nav>
  );
}
