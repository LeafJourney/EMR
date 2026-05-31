"use client";

import { Button } from "@/components/ui/button";
import { useReportError } from "@/components/error-pages/use-report-error";

/**
 * Kiosk route-group error boundary. A front-desk tablet has no one to debug it,
 * so the recovery is a single big "Start over" that resets the boundary back to
 * the search screen.
 */
export default function KioskError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportError(error);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4" aria-hidden="true">
          🌿
        </div>
        <h1 className="font-display text-2xl md:text-3xl text-text tracking-tight leading-tight mb-3">
          Let&rsquo;s start over.
        </h1>
        <p className="text-[15px] text-text-muted mb-8 leading-relaxed">
          Something hiccuped. Tap below to try again, or see the front desk and
          they&rsquo;ll get you checked in.
        </p>
        <Button size="lg" onClick={reset} className="min-w-[160px]">
          Start over
        </Button>
        {error.digest && (
          <p className="mt-8 font-mono text-[11px] tracking-tight text-text-subtle">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
