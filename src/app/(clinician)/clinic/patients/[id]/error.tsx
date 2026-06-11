"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";
import { useReportError } from "@/components/error-pages/use-report-error";

export default function PatientChartError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportError(error);
  useEffect(() => {
    console.error("[patient chart] error:", error);
  }, [error]);

  return (
    <PageShell maxWidth="max-w-[720px]">
      <Card tone="raised" className="border-l-4 border-l-danger">
        <CardContent className="py-10 text-center">
          <Eyebrow className="justify-center mb-3">Something went wrong</Eyebrow>
          <h1 className="font-display text-2xl text-text tracking-tight">
            We couldn&apos;t load that
          </h1>
          <p className="text-sm text-text-muted mt-3 max-w-md mx-auto leading-relaxed">
            {error.message || "An unexpected error occurred loading this patient chart."}
          </p>
          {error.digest && (
            <p className="text-xs text-text-subtle mt-3 font-mono">
              Error ID: {error.digest}
            </p>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={reset}>Try again</Button>
            <Link href="/clinic/patients">
              <Button variant="secondary">Back to roster</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
