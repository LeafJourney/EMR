"use client";

// Celebratory "practice has been born" moment shown when the onboarding wizard
// redirects here with ?published=1. Self-clears the query param after a beat so
// a refresh/back-nav doesn't re-trigger it, and is manually dismissible.

import * as React from "react";
import { useRouter } from "next/navigation";

export function PracticeBornBanner({ practiceName }: { practiceName: string }) {
  const router = useRouter();
  const [show, setShow] = React.useState(true);

  React.useEffect(() => {
    const t = setTimeout(() => {
      // Strip ?published=1 without disturbing the rest of the page.
      router.replace(window.location.pathname);
    }, 9000);
    return () => clearTimeout(t);
  }, [router]);

  if (!show) return null;

  return (
    <div
      role="status"
      className="mb-6 rounded-2xl border border-accent/30 bg-accent-soft/30 px-5 py-4 flex items-start justify-between gap-4 lm-fade-in"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden="true">
          🌱
        </span>
        <div>
          <p className="font-display text-lg text-text tracking-tight">
            {practiceName} has been created
          </p>
          <p className="text-[13px] text-text-muted mt-0.5">
            Here is your new practice. Below is its setup health, who still needs
            inviting, and what to do next to take it live.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setShow(false)}
        className="text-[12px] text-text-muted hover:text-text transition-colors shrink-0"
      >
        Dismiss
      </button>
    </div>
  );
}
