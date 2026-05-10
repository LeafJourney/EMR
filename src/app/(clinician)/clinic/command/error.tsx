"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyIllustration } from "@/components/ui/ornament";
import { logger } from "@/lib/observability/log";

export default function CommandError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error({ event: "clinic.command_center.boundary", err: error });
  }, [error]);

  return (
    <div className="px-6 lg:px-12 py-10">
      <div className="mx-auto w-full max-w-[720px] flex flex-col items-center text-center py-16">
        <EmptyIllustration size={120} />
        <h1 className="font-display text-3xl text-text tracking-tight mt-4">
          Command Center didn&rsquo;t load.
        </h1>
        <p className="text-sm text-text-muted mt-2 max-w-md leading-relaxed">
          One of the dashboard tiles failed to render. Details below so we can fix the
          right thing instead of a guess.
        </p>

        <pre className="mt-5 max-w-full overflow-auto rounded-lg border border-border bg-surface-muted px-4 py-3 text-left text-[11px] leading-relaxed text-text-muted">
          {error.digest ? `digest: ${error.digest}\n` : ""}
          {error.name}: {error.message}
        </pre>

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={() => reset()} variant="secondary">
            Try again
          </Button>
          <Button
            onClick={() => (window.location.href = "/clinic")}
            variant="ghost"
          >
            Go to Today
          </Button>
        </div>
      </div>
    </div>
  );
}
