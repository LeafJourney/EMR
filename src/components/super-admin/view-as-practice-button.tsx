"use client";

// EMR-742 Phase 2 — "View as practice" entry button.
//
// Rendered on the super-admin practice drill-in page header. On click,
// POSTs to /api/admin/impersonate/[practiceId]; the route handler issues
// the signed HttpOnly cookie. We then call router.refresh() so the
// server re-renders the (super-admin) layout — which is where the
// impersonation banner mounts — and the banner appears without a full
// page reload.
//
// Errors (MFA required, practice not found, network) surface as inline
// red text under the button. We deliberately keep this surface
// minimal: no toast system, no dialog. The audit-critical work happens
// server-side; this client just relays the click.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /**
   * Practice identifier to impersonate. The API accepts either
   * Organization.id or PracticeConfiguration.id (it resolves both),
   * so the caller can pass whichever it has on hand.
   */
  practiceOrgId: string;
  /** Human-readable name, used only for the confirm prompt. */
  practiceName: string;
}

export function ViewAsPracticeButton({ practiceOrgId, practiceName }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    // Confirm to prevent accidental clicks — impersonation writes an
    // audit row that the user can't undo, so making the action
    // intentional is cheap insurance.
    const ok = window.confirm(
      `Enter "View as practice" mode for ${practiceName}?\n\n` +
        "Your super-admin identity remains the audit attribution. " +
        "Session auto-expires in 30 minutes.",
    );
    if (!ok) return;

    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/impersonate/${encodeURIComponent(practiceOrgId)}`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
          },
        );

        if (!res.ok) {
          let message = `Failed to start impersonation (HTTP ${res.status}).`;
          try {
            const body = (await res.json()) as { message?: string; error?: string };
            message = body.message ?? body.error ?? message;
          } catch {
            // body wasn't JSON; keep the generic message
          }
          setError(message);
          return;
        }

        // Refresh so the (super-admin) layout re-renders and the
        // banner picks up the newly-set cookie.
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Network error starting impersonation.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="secondary"
        size="sm"
        leadingIcon={<Eye className="h-4 w-4" aria-hidden />}
        onClick={handleClick}
        disabled={pending}
        aria-label={`View as ${practiceName}`}
      >
        {pending ? "Starting…" : "View as practice"}
      </Button>
      {error && (
        <p
          role="alert"
          className="text-[11px] text-danger max-w-[260px] text-right"
        >
          {error}
        </p>
      )}
    </div>
  );
}
