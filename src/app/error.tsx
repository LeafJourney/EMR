"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useReportError } from "@/components/error-pages/use-report-error";

/**
 * Root error boundary. Catches anything thrown above the (clinician) /
 * (patient) / (operator) route groups, including unmatched root routes.
 * Group-level boundaries take precedence inside their own subtrees and
 * have their own copy + home target.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportError(error);

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-bg px-6">
      <div className="absolute inset-0 ambient pointer-events-none" />

      <main className="relative z-10 flex flex-col items-center text-center max-w-lg py-20 animate-in fade-in slide-in-from-bottom-3 duration-700">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-danger mb-3">
          Unexpected error
        </p>

        <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.08] mb-4">
          Something didn&rsquo;t go as planned.
        </h1>

        <p className="text-[16px] text-text-muted leading-relaxed mb-10 max-w-md">
          We hit an unexpected issue rendering this page. Your data is
          safe — this is a display problem, not a data problem. Try
          again, and if it keeps happening, let us know.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Button size="lg" onClick={reset} className="min-w-[160px]">
            Try again
          </Button>
          <Link href="/" className="w-full sm:w-auto">
            <Button size="lg" variant="secondary" className="w-full min-w-[160px]">
              Go home
            </Button>
          </Link>
        </div>

        {error.digest && (
          <p className="mt-10 font-mono text-[11px] tracking-tight text-text-subtle">
            Reference: {error.digest}
          </p>
        )}
      </main>
    </div>
  );
}
