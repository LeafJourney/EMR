"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useReportError } from "@/components/error-pages/use-report-error";

/**
 * Patient route-group error boundary. Catches anything thrown inside
 * /portal/* that isn't handled by a more specific boundary. "Go home"
 * routes back to the patient portal dashboard.
 */
export default function PatientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportError(error);

  return (
    <div className="flex items-center justify-center min-h-[70vh] p-8">
      <div className="text-center max-w-md animate-in fade-in slide-in-from-bottom-2 duration-500">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-danger mb-3">
          Portal &middot; Unexpected error
        </p>
        <h1 className="font-display text-2xl md:text-3xl text-text tracking-tight leading-tight mb-3">
          Something didn&rsquo;t go as planned.
        </h1>
        <p className="text-[15px] text-text-muted mb-8 leading-relaxed">
          We hit a hiccup loading this page. Your records and messages
          are safe. Try again, or message your care team if this keeps
          happening.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" onClick={reset} className="min-w-[140px]">
            Try again
          </Button>
          <Link href="/portal">
            <Button size="lg" variant="secondary" className="min-w-[140px]">
              Back to dashboard
            </Button>
          </Link>
        </div>

        {error.digest && (
          <p className="mt-8 font-mono text-[11px] tracking-tight text-text-subtle">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
