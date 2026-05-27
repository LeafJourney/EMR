"use client";

import { EmptyIllustration } from "@/components/ui/ornament";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="px-6 lg:px-12 py-10">
      <div className="mx-auto w-full max-w-[800px] flex flex-col items-center text-center py-16">
        <EmptyIllustration size={120} />
        <h1 className="font-display text-3xl text-text tracking-tight mt-4">
          Something went wrong.
        </h1>
        <p className="text-sm text-text-muted mt-2 max-w-md leading-relaxed">
          We ran into an unexpected issue loading the operations dashboard. This
          has been logged. Try refreshing, or go back to ops.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={() => reset()} variant="secondary">
            Try again
          </Button>
          <Button onClick={() => (window.location.href = "/ops")} variant="ghost">
            Back to ops
          </Button>
        </div>
      </div>
    </div>
  );
}
