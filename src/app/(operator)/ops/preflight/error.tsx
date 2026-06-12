"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";

export default function PreflightError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ops/preflight] error:", error);
  }, [error]);

  return (
    <PageShell maxWidth="max-w-[720px]">
      <Card tone="raised" className="border-l-4 border-l-danger">
        <CardContent className="py-10 text-center">
          <Eyebrow className="justify-center mb-3">
            Something went wrong
          </Eyebrow>
          <h1 className="font-display text-2xl text-text tracking-tight">
            Pre-Flight couldn&apos;t load
          </h1>
          <p className="text-sm text-text-muted mt-3 max-w-md mx-auto leading-relaxed">
            {error.message || "An unexpected error occurred."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={reset}>Try again</Button>
            <Link href="/ops">
              <Button variant="secondary">Back to overview</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
