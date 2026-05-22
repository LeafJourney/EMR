"use client";

// Success banner shown after Step 15 redirects with ?published=1. Auto-clears
// the query param after mount so a refresh doesn't keep showing the banner.

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";

export function PublishedBanner() {
  const router = useRouter();
  const [open, setOpen] = React.useState(true);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      router.replace("/practices");
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [router]);

  if (!open) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-[color:var(--success)]/30 bg-[color:var(--accent-soft)] px-4 py-3">
      <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-display text-sm text-text">
          Practice published 🎉
        </div>
        <p className="text-[13px] text-text-muted mt-0.5">
          Your new configuration is live. Click any card below to drill into
          its KPIs, providers, activity, and billing.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          router.replace("/practices");
        }}
        className="text-text-muted hover:text-text"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
