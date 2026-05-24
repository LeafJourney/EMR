import Link from "next/link";

import { Button } from "@/components/ui/button";
import { OpenCommandPaletteButton } from "@/components/error-pages/open-command-palette-button";
import { WanderingLeafIllustration } from "@/components/error-pages/wandering-leaf-illustration";

/**
 * App-wide 404. Reached when no segment claims the URL.
 *
 * We can't read the session here (this file is rendered statically by
 * Next at build time for many paths), so "Go home" routes to `/`, which
 * the root page already redirects to the role-appropriate dashboard.
 */
export default function NotFoundPage() {
  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-bg">
      {/* Ambient background wash */}
      <div className="absolute inset-0 ambient pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--bg)] pointer-events-none" />

      <main className="relative z-10 flex flex-col items-center text-center px-6 py-20 max-w-xl animate-in fade-in slide-in-from-bottom-3 duration-700">
        <WanderingLeafIllustration size={176} className="mb-10 opacity-90" />

        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-subtle mb-3">
          404 &middot; Not found
        </p>

        <h1 className="font-display text-4xl md:text-5xl text-text tracking-tight leading-[1.05] mb-4">
          This page wandered off.
        </h1>

        <p className="text-[17px] text-text-muted leading-relaxed mb-10 max-w-md">
          The link may be stale, or the page may have moved. Try the
          command palette, or head home and we&rsquo;ll point you the
          right way.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link href="/" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto min-w-[160px]">
              Go home
            </Button>
          </Link>
          <OpenCommandPaletteButton
            label="Search"
            className="w-full sm:w-auto min-w-[180px]"
          />
        </div>
      </main>
    </div>
  );
}
