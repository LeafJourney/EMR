"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Wordmark } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { MobilePortraitNav } from "@/components/layout/MobilePortraitNav";

// LeafMart and Marketplace previously both pointed at the legacy
// external `theleafmart.com`, which (a) navigated visitors away from
// the in-app surfaces and (b) lost the in-app catalogs — /leafmart
// (consumer storefront) and /marketplace (editorial catalog, PDPs
// from PR #348) both exist as real internal routes. Same fix shipped
// for MobilePortraitNav in PR #353; this completes the desktop nav.
// Caught by commercial-conversion smoke test (pass 9).
// Added `Features` and `Pricing` to the primary marketing nav so the
// fully built /features and /pricing routes (the pricing one was
// previously redirecting to `/`) are actually reachable. Stripe /
// Linear / Vercel-tier marketing surfaces always expose pricing in
// the top nav — it's the question every B2B evaluator asks first.
const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Security", href: "/security" },
  { label: "Education", href: "/education" },
  { label: "LeafMart", href: "/leafmart" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Developer", href: "/developer" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className="sticky top-0 z-30 backdrop-blur-lg bg-bg/80 border-b border-transparent transition-[border-color,background-color] duration-300 data-[scrolled]:border-border data-[scrolled]:bg-bg/95"
    >
      <div className="max-w-[1320px] mx-auto flex items-center justify-between gap-2 px-3 sm:px-6 lg:px-12 h-16">
        <Link href="/" aria-label="Leafjourney home" className="shrink-0">
          <Wordmark size="md" />
        </Link>

        {/* EMR-189: tablet+ only — phones get the swipeable grid below. */}
        <nav
          className="hidden md:flex flex-1 min-w-0 items-center gap-0.5 overflow-x-auto no-scrollbar"
          aria-label="Main"
        >
          {NAV_LINKS.map((link) => {
            const isExternal = "external" in link && link.external;
            return (
              <Link
                key={link.label}
                href={link.href}
                {...(isExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="text-xs sm:text-sm text-text-muted hover:text-text px-2 sm:px-3 py-2 rounded-lg hover:bg-surface-muted transition-colors whitespace-nowrap shrink-0"
              >
                {link.label}
              </Link>
            );
          })}
          {/* Use a plain <a> + prefetch={false} so each click forces a fresh
              load of the Clerk widget — avoids stale auth state. */}
          <a
            href="/sign-in"
            className="text-xs sm:text-sm text-text-muted hover:text-text px-2 sm:px-3 py-2 rounded-lg hover:bg-surface-muted transition-colors whitespace-nowrap shrink-0"
          >
            Sign in
          </a>
        </nav>

        {/* Demo CTA in the top-right corner — route to /book-demo (sales
            intake) rather than /sign-up (Clerk account creation). Matches
            the same fix applied across the homepage hero CTAs and the
            pricing/about/security closing CTAs. */}
        <Link href="/book-demo" className="shrink-0">
          <Button size="sm" className="px-2.5 sm:px-3.5 text-xs sm:text-sm">
            Demo
          </Button>
        </Link>
      </div>

      {/* EMR-189: mobile-portrait grid — every primary tab visible without
          a hamburger. Hidden at md+ where the inline nav above is shown. */}
      <MobilePortraitNav />
    </header>
  );
}
