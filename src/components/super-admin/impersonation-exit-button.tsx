"use client";

// EMR-742 Phase 2 — Exit button used inside the impersonation banner.
// Split out from impersonation-banner.tsx because the banner itself is
// a server component (it reads the cookie via `readImpersonationFromCookies`).
//
// POSTs to /api/admin/impersonate/exit (idempotent) and refreshes so
// the layout re-renders without the banner.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export function ImpersonationExitButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/impersonate/exit", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
        });
        if (!res.ok) {
          setError(`Exit failed (HTTP ${res.status}).`);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Network error exiting.",
        );
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span
          role="alert"
          className="text-[11px] text-amber-900/80"
        >
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={
          "inline-flex items-center gap-1.5 rounded-md " +
          "bg-amber-900/10 hover:bg-amber-900/20 " +
          "text-amber-950 text-[12px] font-semibold " +
          "px-2.5 h-7 transition-colors " +
          "disabled:opacity-60 disabled:cursor-not-allowed " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-900/40"
        }
        aria-label="Exit impersonation"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
        {pending ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
}
