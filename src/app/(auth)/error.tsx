"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Error boundary for the (auth) route group. Without this, any thrown error
// inside /sign-in or /sign-up bubbles all the way up to app/global-error.tsx
// and the user sees a bare "Something went wrong" page with no path back to
// the auth widget. Scoped to the auth shell so the sign-in form is one click
// away.
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="font-display text-2xl text-text tracking-tight mb-3">
        We couldn&apos;t load sign-in
      </h1>
      <p className="text-sm text-text-muted mb-6 leading-relaxed max-w-sm">
        Something went sideways loading the sign-in widget. Your data is safe.
        Try again, or head back to the home page.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/">
          <Button variant="secondary">Back home</Button>
        </Link>
      </div>
      {error.digest && (
        <p className="text-[10px] text-text-subtle mt-6">
          Ref: {error.digest}
        </p>
      )}
    </div>
  );
}
